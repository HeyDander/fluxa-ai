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

## SerpAPI

Create `.env`:

```env
SERPAPI_KEY=your_key_here
```

## Notes

- `data_seed.txt` is the small training seed kept in git
- large generated data and local user files are ignored
