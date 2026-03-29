# mini_llm

Это первая настоящая GPT-подобная модель в проекте `fluxa-ai`, написанная с нуля на PyTorch.

Важно:

- это не уровень ChatGPT;
- это маленькая decoder-only модель;
- она реально генерирует текст, а не выбирает готовый ответ из правил.

## Что внутри

- `tokenizer.py` — символьный токенизатор
- `data.py` — подготовка корпуса и батчей
- `model.py` — decoder-only transformer
- `train.py` — обучение
- `generate.py` — генерация из prompt
- `chat.py` — простой интерактивный чат

## Установка

Нужен `torch`.

Если у тебя он не установлен:

```bash
pip install torch
```

## Обучение

Из корня проекта:

```bash
python3 -m mini_llm.train --steps 2000
```

Артефакты попадут в:

```text
mini_llm/artifacts/
```

## Генерация

```bash
python3 -m mini_llm.generate --prompt "user: Привет\nassistant:"
```

## Чат

```bash
python3 -m mini_llm.chat
```

## Дальше

Чтобы сделать модель сильнее, следующий шаг:

1. увеличить корпус;
2. перейти от char-level к BPE tokenizer;
3. сделать instruction/chat fine-tuning;
4. подключить модель в `danAI.py` как основной режим ответа.
