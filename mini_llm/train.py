from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict
from pathlib import Path

import torch

from .data import prepare_splits, random_batch
from .model import GPTConfig, MiniGPT


ARTIFACT_DIR = Path("mini_llm/artifacts")


def estimate_loss(model: MiniGPT, train_tokens: torch.Tensor, val_tokens: torch.Tensor, block_size: int, batch_size: int, device: str) -> dict[str, float]:
    model.eval()
    result: dict[str, float] = {}
    for split_name, split_tokens in (("train", train_tokens), ("val", val_tokens)):
        losses = []
        for _ in range(10):
            x, y = random_batch(split_tokens, block_size, batch_size, device)
            _, loss = model(x, y)
            losses.append(float(loss.item()))
        result[split_name] = sum(losses) / len(losses)
    model.train()
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Train a tiny GPT-like model from scratch.")
    parser.add_argument("--data", type=Path, default=Path("data_seed.txt"))
    parser.add_argument("--out", type=Path, default=ARTIFACT_DIR)
    parser.add_argument("--steps", type=int, default=2000)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--block-size", type=int, default=256)
    parser.add_argument("--layers", type=int, default=6)
    parser.add_argument("--heads", type=int, default=6)
    parser.add_argument("--embd", type=int, default=384)
    parser.add_argument("--dropout", type=float, default=0.1)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--min-lr", type=float, default=3e-5)
    parser.add_argument("--warmup-steps", type=int, default=100)
    parser.add_argument("--eval-every", type=int, default=200)
    parser.add_argument("--save-every", type=int, default=500)
    parser.add_argument("--grad-accum", type=int, default=1)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--device", type=str, default="cuda" if torch.cuda.is_available() else "cpu")
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    prepared = prepare_splits(args.data)
    prepared.tokenizer.save(args.out / "tokenizer.json")

    config = GPTConfig(
        vocab_size=prepared.tokenizer.vocab_size,
        block_size=args.block_size,
        n_layer=args.layers,
        n_head=args.heads,
        n_embd=args.embd,
        dropout=args.dropout,
    )
    model = MiniGPT(config).to(args.device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    scaler = torch.cuda.amp.GradScaler(enabled=args.device.startswith("cuda"))
    start_step = 0

    meta = {
        "config": asdict(config),
        "data_file": str(args.data),
        "device": args.device,
        "steps": args.steps,
        "parameters": model.num_parameters(),
    }
    (args.out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    checkpoint_path = args.out / "model.pt"
    if args.resume and checkpoint_path.exists():
        checkpoint = torch.load(checkpoint_path, map_location=args.device)
        model.load_state_dict(checkpoint["model_state"])
        optimizer.load_state_dict(checkpoint["optimizer_state"])
        start_step = int(checkpoint.get("step", 0))
        print(f"resumed from step {start_step}")

    print(f"parameters: {model.num_parameters():,}")

    best_val = math.inf
    if checkpoint_path.exists() and args.resume:
        best_val = float(torch.load(checkpoint_path, map_location="cpu").get("val_loss", math.inf))

    optimizer.zero_grad(set_to_none=True)
    for step in range(start_step + 1, args.steps + 1):
        if step <= args.warmup_steps:
            lr = args.lr * step / max(args.warmup_steps, 1)
        else:
            progress = (step - args.warmup_steps) / max(args.steps - args.warmup_steps, 1)
            cosine = 0.5 * (1.0 + math.cos(math.pi * progress))
            lr = args.min_lr + (args.lr - args.min_lr) * cosine
        for group in optimizer.param_groups:
            group["lr"] = lr

        with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=args.device.startswith("cuda")):
            x, y = random_batch(prepared.train_tokens, args.block_size, args.batch_size, args.device)
            _, loss = model(x, y)
            loss = loss / args.grad_accum

        scaler.scale(loss).backward()
        if step % args.grad_accum == 0:
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(optimizer)
            scaler.update()
            optimizer.zero_grad(set_to_none=True)

        if step == 1 or step % args.eval_every == 0 or step == args.steps:
            metrics = estimate_loss(
                model,
                prepared.train_tokens,
                prepared.val_tokens,
                args.block_size,
                args.batch_size,
                args.device,
            )
            print(
                f"step {step:>5} | train_loss {metrics['train']:.4f} | "
                f"val_loss {metrics['val']:.4f}"
            )
            if metrics["val"] < best_val:
                best_val = metrics["val"]
                torch.save(
                    {
                        "model_state": model.state_dict(),
                        "optimizer_state": optimizer.state_dict(),
                        "config": asdict(config),
                        "step": step,
                        "val_loss": best_val,
                    },
                    args.out / "model.pt",
                )

        if step % args.save_every == 0:
            torch.save(
                {
                    "model_state": model.state_dict(),
                    "optimizer_state": optimizer.state_dict(),
                    "config": asdict(config),
                    "step": step,
                },
                args.out / f"checkpoint_{step}.pt",
            )


if __name__ == "__main__":
    main()
