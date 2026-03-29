from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


SPECIAL_TOKENS = ["<pad>", "<bos>", "<eos>"]


@dataclass
class CharTokenizer:
    stoi: dict[str, int]
    itos: dict[int, str]
    pad_id: int
    bos_id: int
    eos_id: int

    @classmethod
    def build(cls, text: str) -> "CharTokenizer":
        vocab = SPECIAL_TOKENS + sorted(set(text))
        stoi = {ch: idx for idx, ch in enumerate(vocab)}
        itos = {idx: ch for ch, idx in stoi.items()}
        return cls(
            stoi=stoi,
            itos=itos,
            pad_id=stoi["<pad>"],
            bos_id=stoi["<bos>"],
            eos_id=stoi["<eos>"],
        )

    @property
    def vocab_size(self) -> int:
        return len(self.stoi)

    def encode(self, text: str, add_bos: bool = False, add_eos: bool = False) -> list[int]:
        tokens: list[int] = []
        if add_bos:
            tokens.append(self.bos_id)
        tokens.extend(self.stoi[ch] for ch in text if ch in self.stoi)
        if add_eos:
            tokens.append(self.eos_id)
        return tokens

    def decode(self, token_ids: list[int], skip_special: bool = True) -> str:
        parts: list[str] = []
        for token_id in token_ids:
            value = self.itos.get(int(token_id), "")
            if skip_special and value in SPECIAL_TOKENS:
                continue
            parts.append(value)
        return "".join(parts)

    def save(self, path: Path) -> None:
        path.write_text(
            json.dumps(
                {
                    "stoi": self.stoi,
                    "pad_id": self.pad_id,
                    "bos_id": self.bos_id,
                    "eos_id": self.eos_id,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    @classmethod
    def load(cls, path: Path) -> "CharTokenizer":
        payload = json.loads(path.read_text(encoding="utf-8"))
        stoi = {str(k): int(v) for k, v in payload["stoi"].items()}
        itos = {int(v): str(k) for k, v in stoi.items()}
        return cls(
            stoi=stoi,
            itos=itos,
            pad_id=int(payload["pad_id"]),
            bos_id=int(payload["bos_id"]),
            eos_id=int(payload["eos_id"]),
        )

