from __future__ import annotations

import argparse
from pathlib import Path

import torch

from .generate import load_model


def trim_answer(text: str) -> str:
    if "assistant:" in text:
        text = text.split("assistant:", 1)[-1]
    if "user:" in text:
        text = text.split("user:", 1)[0]
    return text.strip()


def main() -> None:
    parser = argparse.ArgumentParser(description="Interactive chat with the mini GPT model.")
    parser.add_argument("--artifacts", type=Path, default=Path("mini_llm/artifacts"))
    parser.add_argument("--temperature", type=float, default=0.85)
    parser.add_argument("--top-k", type=int, default=40)
    parser.add_argument("--tokens", type=int, default=160)
    parser.add_argument("--device", type=str, default="cuda" if torch.cuda.is_available() else "cpu")
    args = parser.parse_args()

    model, tokenizer = load_model(args.artifacts, args.device)
    history: list[str] = []

    print("=== Fluxa Mini LLM Chat ===")
    print("Напиши 'выход', чтобы завершить.")
    while True:
        user = input("Ты: ").strip()
        if not user:
            continue
        if user.lower() in {"выход", "exit", "quit"}:
            break

        history.append(f"user: {user}")
        prompt = "\n".join(history[-6:]) + "\nassistant:"
        prompt_ids = tokenizer.encode(prompt, add_bos=True)
        x = torch.tensor([prompt_ids], dtype=torch.long, device=args.device)
        output = model.generate(
            x,
            max_new_tokens=args.tokens,
            temperature=args.temperature,
            top_k=args.top_k,
            eos_token_id=tokenizer.eos_id,
        )
        text = tokenizer.decode(output[0].tolist())
        answer = trim_answer(text[len(prompt) :]) if text.startswith(prompt) else trim_answer(text)
        answer = answer or "Пока отвечаю слабо, но модель уже реально генерирует текст."
        print("Bot:", answer)
        history.append(f"assistant: {answer}")


if __name__ == "__main__":
    main()

