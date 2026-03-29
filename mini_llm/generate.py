from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch

from .model import GPTConfig, MiniGPT
from .tokenizer import CharTokenizer


def load_model(artifact_dir: Path, device: str) -> tuple[MiniGPT, CharTokenizer]:
    tokenizer = CharTokenizer.load(artifact_dir / "tokenizer.json")
    checkpoint = torch.load(artifact_dir / "model.pt", map_location=device)
    config = GPTConfig(**checkpoint["config"])
    model = MiniGPT(config)
    model.load_state_dict(checkpoint["model_state"])
    model.to(device)
    model.eval()
    return model, tokenizer


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate text with the local mini GPT model.")
    parser.add_argument("--artifacts", type=Path, default=Path("mini_llm/artifacts"))
    parser.add_argument("--prompt", type=str, default="user: Привет\nassistant:")
    parser.add_argument("--tokens", type=int, default=180)
    parser.add_argument("--temperature", type=float, default=0.9)
    parser.add_argument("--top-k", type=int, default=40)
    parser.add_argument("--device", type=str, default="cuda" if torch.cuda.is_available() else "cpu")
    args = parser.parse_args()

    model, tokenizer = load_model(args.artifacts, args.device)
    prompt_ids = tokenizer.encode(args.prompt, add_bos=True)
    x = torch.tensor([prompt_ids], dtype=torch.long, device=args.device)
    output = model.generate(
        x,
        max_new_tokens=args.tokens,
        temperature=args.temperature,
        top_k=args.top_k,
        eos_token_id=tokenizer.eos_id,
    )
    text = tokenizer.decode(output[0].tolist())
    print(text)


if __name__ == "__main__":
    main()

