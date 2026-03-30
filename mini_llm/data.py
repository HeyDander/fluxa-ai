from __future__ import annotations

import random
import re
from dataclasses import dataclass
from pathlib import Path

import torch
from torch.utils.data import Dataset

from .tokenizer import CharTokenizer


PAIR_RE = re.compile(r"User:\s*(.*?)\nBot:\s*(.*?)(?=\n\s*\nUser:|\Z)", re.S)


def build_corpus(seed_path: Path) -> str:
    raw = seed_path.read_text(encoding="utf-8")
    pairs = PAIR_RE.findall(raw)
    chunks: list[str] = []

    for user, bot in pairs:
        user = user.strip()
        bot = bot.strip()
        if not user or not bot:
            continue
        chunks.append(f"<chat>\nuser: {user}\nassistant: {bot}\n</chat>\n")
        chunks.append(f"Вопрос: {user}\nОтвет: {bot}\n")
        chunks.append(f"### instruction\n{user}\n### response\n{bot}\n")
        chunks.append(f"Запрос: {user}\nРешение: {bot}\n")

    chunks.append(raw)
    return "\n".join(chunks)


@dataclass
class SplitData:
    train_tokens: torch.Tensor
    val_tokens: torch.Tensor
    tokenizer: CharTokenizer
    corpus_text: str


def prepare_splits(seed_path: Path, train_ratio: float = 0.95) -> SplitData:
    corpus_text = build_corpus(seed_path)
    tokenizer = CharTokenizer.build(corpus_text)
    token_ids = tokenizer.encode(corpus_text, add_bos=True, add_eos=True)
    split_index = max(2, int(len(token_ids) * train_ratio))
    train_tokens = torch.tensor(token_ids[:split_index], dtype=torch.long)
    val_tokens = torch.tensor(token_ids[split_index:], dtype=torch.long)
    if val_tokens.numel() < 2:
        val_tokens = train_tokens[-max(2, min(256, train_tokens.numel())) :].clone()
    return SplitData(
        train_tokens=train_tokens,
        val_tokens=val_tokens,
        tokenizer=tokenizer,
        corpus_text=corpus_text,
    )


class NextTokenDataset(Dataset):
    def __init__(self, tokens: torch.Tensor, block_size: int):
        self.tokens = tokens
        self.block_size = block_size

    def __len__(self) -> int:
        return max(1, self.tokens.numel() - self.block_size - 1)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        start = min(idx, self.tokens.numel() - self.block_size - 1)
        chunk = self.tokens[start : start + self.block_size + 1]
        x = chunk[:-1]
        y = chunk[1:]
        return x, y


def random_batch(tokens: torch.Tensor, block_size: int, batch_size: int, device: str) -> tuple[torch.Tensor, torch.Tensor]:
    max_start = tokens.numel() - block_size - 1
    indices = [random.randint(0, max_start) for _ in range(batch_size)]
    x = torch.stack([tokens[i : i + block_size] for i in indices]).to(device)
    y = torch.stack([tokens[i + 1 : i + block_size + 1] for i in indices]).to(device)
    return x, y
