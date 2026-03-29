# fluxa-ai

`fluxa-ai` is a local Python chat app with:

- terminal chat mode
- browser chat UI
- local login and registration
- optional SerpAPI internet search

## Run

```bash
python3 danAI.py
```

## Web

```bash
python3 danAI.py --web
```

Open `http://127.0.0.1:8000`

## Railway Deploy

This repo is ready for Railway.

1. Push the repo to GitHub
2. Create a new Railway project from the GitHub repo
3. Railway will use `railway.toml`
4. Add environment variables in Railway:

```env
SERPAPI_KEY=your_key_here
```

Railway will run:

```bash
python3 danAI.py --web --host 0.0.0.0 --port 8000
```

## SerpAPI

Create `.env`:

```env
SERPAPI_KEY=your_key_here
```

## Notes

- `data_seed.txt` is the small training seed kept in git
- large generated data and local user files are ignored

## mini_llm

There is now a separate `mini_llm/` folder with a real GPT-like model written from scratch in PyTorch.

It is not ChatGPT-level, but it is a real decoder-only transformer that can be trained locally and generate text on its own.

Train:

```bash
python3 -m mini_llm.train --steps 2000
```

Generate:

```bash
python3 -m mini_llm.generate --prompt "user: Привет\nassistant:"
```

Chat:

```bash
python3 -m mini_llm.chat
```

See more details in [`mini_llm/README.md`](mini_llm/README.md).
