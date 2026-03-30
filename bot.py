from __future__ import annotations

import asyncio
import os
from typing import Any

import aiohttp
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import Message


TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini").strip() or "openai/gpt-4o-mini"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_PROMPT = (
    "Ты полезный русскоязычный ассистент. "
    "Отвечай по делу, без пустых вступлений. "
    "Если пользователь просит код, сразу давай код. "
    "Если запрос обычный, отвечай кратко и понятно."
)


async def ask_openrouter(text: str) -> str:
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
    }
    timeout = aiohttp.ClientTimeout(total=60)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(OPENROUTER_URL, headers=headers, json=payload) as response:
            if response.status >= 400:
                body = await response.text()
                raise RuntimeError(f"OpenRouter error {response.status}: {body}")
            data = await response.json()
    choices = data.get("choices") or []
    if not choices:
        return "Пустой ответ от модели."
    message = choices[0].get("message") or {}
    content = str(message.get("content", "")).strip()
    return content or "Пустой ответ от модели."


dp = Dispatcher()


@dp.message(CommandStart())
async def on_start(message: Message) -> None:
    await message.answer("Бот подключен. Напиши сообщение.")


@dp.message(F.text)
async def on_text(message: Message) -> None:
    text = (message.text or "").strip()
    if not text:
        await message.answer("Напиши текст.")
        return
    try:
        answer = await ask_openrouter(text)
    except Exception as error:
        await message.answer(f"Ошибка: {error}")
        return
    await message.answer(answer)


async def main() -> None:
    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not set")
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not set")
    bot = Bot(TELEGRAM_BOT_TOKEN)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
