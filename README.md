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
python3 danAI.py --web --host 0.0.0.0 --port $PORT
```

## SerpAPI

Create `.env`:

```env
SERPAPI_KEY=your_key_here
```

## Notes

- `data_seed.txt` is the small training seed kept in git
- large generated data and local user files are ignored
