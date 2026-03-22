from __future__ import annotations

import argparse
import os
import json
import math
import random
import re
import urllib.parse
import urllib.request
import hashlib
import secrets
import datetime as dt
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.cookies import SimpleCookie
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
import ast
import operator

try:
    import psycopg
except ImportError:
    psycopg = None


DATA_FILE = Path("data_seed.txt") if Path("data_seed.txt").exists() else Path("data.txt")
ENV_FILE = Path(".env")
MODEL_DIR = Path("model_store")
INDEX_FILE = MODEL_DIR / "chat_index.json"
MEMORY_FILE = MODEL_DIR / "user_memory.txt"
PROFILE_FILE = MODEL_DIR / "user_profile.json"
USERS_FILE = MODEL_DIR / "users.json"
CHATS_FILE = MODEL_DIR / "chats.json"
SESSIONS_FILE = MODEL_DIR / "sessions.json"
TARGET_SAMPLES = 6_000_000
TOP_K = 5
MIN_SCORE = 0.17
RANDOM_SEED = 42
INDEX_VERSION = 4
SERPAPI_ENDPOINT = "https://serpapi.com/search.json"

STOPWORDS = {
    "а",
    "без",
    "более",
    "бы",
    "в",
    "вам",
    "вас",
    "все",
    "всё",
    "вы",
    "где",
    "да",
    "для",
    "до",
    "если",
    "еще",
    "ещё",
    "же",
    "за",
    "и",
    "из",
    "или",
    "как",
    "какая",
    "какой",
    "какую",
    "ко",
    "когда",
    "ли",
    "мне",
    "мы",
    "на",
    "над",
    "не",
    "но",
    "ну",
    "о",
    "об",
    "однако",
    "он",
    "она",
    "они",
    "от",
    "по",
    "под",
    "при",
    "про",
    "с",
    "со",
    "так",
    "также",
    "там",
    "такое",
    "такой",
    "такая",
    "тебе",
    "тебя",
    "то",
    "только",
    "ты",
    "у",
    "уже",
    "что",
    "чтобы",
    "это",
    "эта",
    "этот",
    "умеешь",
    "можешь",
    "помочь",
    "написать",
    "ли",
    "я",
    "расскажи",
    "придумай",
    "анекдот",
    "историю",
    "история",
    "шутку",
}

INTENTS = {
    "greeting": {"привет", "здравствуй", "здравствуйте", "хай", "hello", "hi"},
    "bye": {"пока", "до свидания", "увидимся", "bye"},
    "thanks": {"спасибо", "благодарю", "thanks"},
    "joke": {"шутка", "анекдот", "смешное", "прикол"},
    "laugh": {"хаха", "ахаха", "смешно", "лол", "lol"},
    "coding": {"код", "кодить", "программировать", "python", "скрипт", "разработка"},
    "state_good": {"нормально", "хорошо", "неплохо", "отлично", "пойдет", "пойдёт"},
    "state_bad": {"плохо", "грустно", "устал", "тяжело", "без сил"},
    "movie": {"фильм", "кино", "сериал"},
    "food": {"еда", "ужин", "завтрак", "обед", "пицца", "готовить", "рецепт"},
    "sport": {"спорт", "упражнение", "тренировка", "ног", "спины", "домa", "дома"},
    "study": {"учиться", "экзамен", "домашк", "python", "программировать", "язык"},
    "stress": {"стресс", "усталость", "расслабиться", "сон", "мотивация"},
}

LATIN_ALIASES = {
    "privet": "привет",
    "priv": "привет",
    "poka": "пока",
    "spasibo": "спасибо",
    "blagodaryu": "благодарю",
    "kak dela": "как дела",
    "kak ty": "как ты",
    "normalno": "нормально",
    "norm": "нормально",
    "normal": "нормально",
    "ok": "ок",
    "okei": "ок",
    "xorosho": "хорошо",
    "horosho": "хорошо",
    "anekdot": "анекдот",
    "shutka": "шутка",
    "vyhod": "выход",
}

FALLBACKS = {
    "greeting": [
        "Привет. Я готов помочь: могу подсказать идею, факт, совет или ответ из базы диалогов.",
        "Привет. Спроси про учебу, фильмы, привычки, рецепты или просто попроси шутку.",
    ],
    "bye": [
        "Пока. Если захочешь, потом продолжим разговор.",
        "До связи. Возвращайся с новым вопросом.",
    ],
    "thanks": [
        "Пожалуйста.",
        "Обращайся.",
    ],
    "joke": [
        "Почему программист всегда спокоен? Он знает, что любой баг можно локализовать.",
        "Шутка: бот хотел отдохнуть, но пользователь открыл ещё одну вкладку с идеями.",
    ],
    "laugh": [
        "Хорошо зашло 😄",
        "Рад, что тебе понравилось 😂",
    ],
    "coding": [
        "Да, с кодом я могу помочь: Python, логика, структура, поиск ошибок и улучшение идей 💻",
        "Да, умею. Могу помочь написать код, объяснить ошибку или улучшить текущий файл 🧠",
    ],
    "state_good": [
        "Это уже неплохо 🙂 Чем хочешь заняться дальше?",
        "Отлично. Тогда можем продолжить и перейти к чему-то полезному ✨",
    ],
    "state_bad": [
        "Понял. Давай без перегруза: можем разобрать одну задачу за раз 🌿",
        "Тогда лучше спокойно и по шагам. Скажи, с чем помочь в первую очередь 🧘",
    ],
    "movie": [
        "Если хочется фантастики на вечер, попробуй \"Интерстеллар\" или \"Начало\".",
        "Для лёгкого вечера подойдёт семейная комедия или сильная фантастика с понятным сюжетом.",
    ],
    "food": [
        "Если нужен быстрый вариант, попробуй запечённые овощи, белок и простой соус без лишнего сахара.",
        "Для старта выбирай простые рецепты: одна крупа, один белок, овощи и минимум сложных шагов.",
    ],
    "sport": [
        "Для дома обычно хватает базы: приседания, отжимания, планка и короткая растяжка.",
        "Если нужна безопасная стартовая тренировка, начни с 10-15 минут и следи за техникой.",
    ],
    "study": [
        "Если хочешь быстро расти, учись маленькими блоками и сразу закрепляй практикой.",
        "Для учебы лучше работает короткий план: теория, один пример, потом самостоятельная задача.",
    ],
    "stress": [
        "Если накрывает усталость, сработает короткая прогулка, вода и 10 минут без уведомлений.",
        "Когда много стресса, начни с дыхания, паузы и одной следующей задачи вместо всего списка сразу.",
    ],
    "default": [
        "Я пока не уверен, что это лучший ответ. Перефразируй вопрос чуть конкретнее, и я подберу ответ точнее.",
        "Могу помочь, но запрос слишком общий. Уточни тему: учеба, фильм, рецепт, привычки, шутка или факт.",
    ],
}

EMOJI_BY_INTENT = {
    "greeting": ["🙂", "😄"],
    "bye": ["👋", "🙂"],
    "thanks": ["🙂", "🤝"],
    "joke": ["😂", "😄"],
    "movie": ["🎬", "🍿"],
    "food": ["🍕", "🍲"],
    "sport": ["💪", "🏋️"],
    "study": ["📚", "🧠"],
    "stress": ["🧘", "🌿"],
    "default": ["🙂", "✨"],
}

GENERIC_OPENERS = {
    "definition": [
        "Если объяснять простыми словами,",
        "Коротко говоря,",
        "По сути,",
    ],
    "how_to": [
        "Я бы начал так:",
        "Практичный вариант такой:",
        "Самый разумный старт такой:",
    ],
    "why": [
        "Обычно причина в том, что",
        "Чаще всего это связано с тем, что",
        "Обычно тут влияет несколько факторов:",
    ],
    "can": [
        "Да, обычно это реально.",
        "Да, такое вполне можно сделать.",
        "В целом да, это рабочая идея.",
    ],
    "opinion": [
        "Я бы посмотрел на это так:",
        "Если без лишней воды,",
        "Мой взгляд такой:",
    ],
}

GENERIC_CLOSERS = [
    "Могу уточнить.",
    "Если надо, скажу короче.",
    "Могу объяснить по шагам.",
]

DEFAULT_SUPPORT_BY_TYPE = {
    "definition": "обычно полезно разобрать, что это такое, где это применяется и какой есть самый простой пример",
    "how_to": "лучше идти от маленького шага, затем закреплять практикой и только потом усложнять",
    "why": "часто на это влияют усталость, неясная цель, страх ошибки или слишком большой первый шаг",
    "can": "проще всего начать с минимальной рабочей версии и дальше улучшать её по шагам",
    "opinion": "лучше сначала уточнить контекст, потом выделить главное и ответить по сути без лишней воды",
}

FACT_PATTERNS = [
    (re.compile(r"\bменя зовут\s+([а-яa-z0-9_-]+)", re.IGNORECASE), "name"),
    (re.compile(r"\bмое имя\s+([а-яa-z0-9_-]+)", re.IGNORECASE), "name"),
    (re.compile(r"\bя люблю\s+(.+)", re.IGNORECASE), "likes"),
    (re.compile(r"\bмне нравится\s+(.+)", re.IGNORECASE), "likes"),
    (re.compile(r"\bя занимаюсь\s+(.+)", re.IGNORECASE), "activity"),
    (re.compile(r"\bя работаю\s+(.+)", re.IGNORECASE), "activity"),
]

BOT_META_RESPONSES = {
    "who": "Я локальный чат-бот на Python. У меня смешанный режим: быстрые правила, память о пользователе, поиск по корпусу и генерация ответа поверх этого.",
    "how_created": "Я собран как локальный гибридный бот: часть логики написана вручную, часть ответов опирается на обучающий корпус, а новые реплики я стараюсь генерировать по смыслу вопроса.",
    "how_work": "Я сначала пытаюсь понять тип вопроса, потом смотрю на контекст и подходящие примеры, и только после этого формирую ответ.",
    "internet_yes": "Да, я могу искать в интернете. Что ты хочешь найти?",
    "internet_no": "Пока поиск в интернете у меня не активен. Добавь `SERPAPI_KEY` в `.env`, и тогда я смогу искать через SerpAPI.",
}

JOKE_TEMPLATES = [
    "Почему {subject} не любит {topic}? Потому что там слишком много {punch}.",
    "{subject} заходит в {place} и говорит: \"Опять {topic}? Ну всё, это уже {punch}\".",
    "Шутка дня: {subject} пытался разобраться с {topic}, но в итоге нашёл только {punch}.",
]

JOKE_SUBJECTS = ["программист", "бот", "студент", "разработчик", "админ"]
JOKE_PLACES = ["чат", "проект", "серверную", "кодовую базу", "кабинет"]
JOKE_PUNCHES = ["багов", "костылей", "дедлайнов", "лишних вопросов", "магии"]

STORY_OPENERS = [
    "Однажды",
    "Представь, что однажды",
    "Есть маленькая история:",
]

STORY_HEROES = ["бот", "разработчик", "ученик", "робот", "кот-программист"]
STORY_GOALS = ["найти хороший ответ", "научиться новому", "починить код", "написать умный чат", "пройти сложную задачу"]
STORY_TWISTS = [
    "но всё оказалось сложнее, чем выглядело в начале",
    "и именно в этот момент появился неожиданный вопрос",
    "а потом стало ясно, что главное не скорость, а понимание",
    "и вскоре он понял, что маленькие шаги работают лучше рывков",
]

SAFE_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

NUMBER_WORDS = {
    "ноль": "0",
    "один": "1",
    "два": "2",
    "три": "3",
    "четыре": "4",
    "пять": "5",
    "шесть": "6",
    "семь": "7",
    "восемь": "8",
    "девять": "9",
    "десять": "10",
}

DEFAULT_CREDITS = 120
MESSAGE_COST = 1
REFERRAL_BONUS = 20
DAILY_LOGIN_BONUS = 10
DAILY_TASK_COUNT = 20
MIN_TASK_REWARD = 15

TASK_POOL = [
    {"id": "msg_1", "title": "Первый шаг", "description": "Отправь 1 сообщение сегодня", "reward": 15, "kind": "messages_sent", "target": 1},
    {"id": "msg_3", "title": "Разогрев", "description": "Отправь 3 сообщения сегодня", "reward": 15, "kind": "messages_sent", "target": 3},
    {"id": "msg_5", "title": "Диалог", "description": "Отправь 5 сообщений сегодня", "reward": 15, "kind": "messages_sent", "target": 5},
    {"id": "msg_8", "title": "Хороший темп", "description": "Отправь 8 сообщений сегодня", "reward": 20, "kind": "messages_sent", "target": 8},
    {"id": "msg_12", "title": "Активный чат", "description": "Отправь 12 сообщений сегодня", "reward": 20, "kind": "messages_sent", "target": 12},
    {"id": "msg_15", "title": "Марафон", "description": "Отправь 15 сообщений сегодня", "reward": 25, "kind": "messages_sent", "target": 15},
    {"id": "search_1", "title": "Первый поиск", "description": "Пусть бот 1 раз поищет ответ в интернете", "reward": 15, "kind": "searches_used", "target": 1},
    {"id": "search_2", "title": "Два поиска", "description": "Используй поиск в интернете 2 раза за день", "reward": 20, "kind": "searches_used", "target": 2},
    {"id": "search_3", "title": "Исследователь", "description": "Используй поиск в интернете 3 раза за день", "reward": 25, "kind": "searches_used", "target": 3},
    {"id": "greet_1", "title": "Поздоровайся", "description": "Начни день с приветствия", "reward": 15, "kind": "greetings", "target": 1},
    {"id": "intro_1", "title": "Знакомство", "description": "Представься боту сегодня", "reward": 20, "kind": "introductions", "target": 1},
    {"id": "joke_1", "title": "Улыбнись", "description": "Попроси анекдот или шутку", "reward": 15, "kind": "joke_requests", "target": 1},
    {"id": "math_1", "title": "Считаем", "description": "Задай один вопрос по математике", "reward": 15, "kind": "math_questions", "target": 1},
    {"id": "code_1", "title": "Кодинг", "description": "Спроси что-нибудь про код или программирование", "reward": 20, "kind": "code_questions", "target": 1},
    {"id": "fact_1", "title": "Любопытство", "description": "Задай познавательный вопрос", "reward": 15, "kind": "knowledge_questions", "target": 1},
    {"id": "long_1", "title": "Развернутый запрос", "description": "Отправь одно длинное сообщение", "reward": 15, "kind": "long_messages", "target": 1},
    {"id": "two_long", "title": "Подробности", "description": "Отправь 2 длинных сообщения за день", "reward": 20, "kind": "long_messages", "target": 2},
    {"id": "creative_1", "title": "Творческий режим", "description": "Попроси историю, идею или что-то придумать", "reward": 20, "kind": "creative_requests", "target": 1},
    {"id": "mood_1", "title": "Поделись настроением", "description": "Расскажи, как у тебя дела", "reward": 15, "kind": "mood_updates", "target": 1},
    {"id": "thanks_1", "title": "Вежливость", "description": "Скажи спасибо боту", "reward": 15, "kind": "thanks_sent", "target": 1},
    {"id": "msg_20", "title": "Серия", "description": "Отправь 20 сообщений сегодня", "reward": 30, "kind": "messages_sent", "target": 20},
    {"id": "search_4", "title": "Глубокий поиск", "description": "Используй поиск в интернете 4 раза за день", "reward": 30, "kind": "searches_used", "target": 4},
    {"id": "joke_2", "title": "Ещё шутка", "description": "Попроси 2 шутки или анекдота за день", "reward": 20, "kind": "joke_requests", "target": 2},
    {"id": "code_2", "title": "Технический разговор", "description": "Задай 2 вопроса про код", "reward": 25, "kind": "code_questions", "target": 2},
    {"id": "fact_2", "title": "Хочу знать больше", "description": "Задай 2 познавательных вопроса", "reward": 20, "kind": "knowledge_questions", "target": 2},
    {"id": "creative_2", "title": "Воображение", "description": "Попроси 2 творческих ответа за день", "reward": 25, "kind": "creative_requests", "target": 2},
    {"id": "thanks_2", "title": "Хороший тон", "description": "Скажи спасибо 2 раза за день", "reward": 20, "kind": "thanks_sent", "target": 2},
    {"id": "mood_2", "title": "Открытый диалог", "description": "2 раза поделись своим состоянием за день", "reward": 20, "kind": "mood_updates", "target": 2},
]


@dataclass
class DialoguePair:
    user: str
    bot: str


def load_dotenv(path: Path = ENV_FILE) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def normalize(text: str) -> str:
    text = text.lower().replace("ё", "е")
    text = re.sub(r"[^a-zа-я0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    for latin, cyrillic in LATIN_ALIASES.items():
        text = re.sub(rf"\b{re.escape(latin)}\b", cyrillic, text)
    return text


def tokenize(text: str) -> list[str]:
    return [token for token in normalize(text).split() if token]


def stem(token: str) -> str:
    for suffix in (
        "иями",
        "ями",
        "ами",
        "его",
        "ого",
        "ему",
        "ому",
        "иях",
        "иях",
        "иях",
        "ия",
        "ья",
        "ьях",
        "иях",
        "ий",
        "ый",
        "ой",
        "ая",
        "яя",
        "ое",
        "ее",
        "ые",
        "ие",
        "ам",
        "ям",
        "ах",
        "ях",
        "ов",
        "ев",
        "ом",
        "ем",
        "ой",
        "ей",
        "ую",
        "юю",
        "а",
        "я",
        "ы",
        "и",
        "е",
        "у",
        "ю",
        "о",
    ):
        if len(token) > 4 and token.endswith(suffix):
            return token[: -len(suffix)]
    return token


def extract_keywords(text: str) -> list[str]:
    keywords = []
    for token in tokenize(text):
        if token in STOPWORDS:
            continue
        keywords.append(stem(token))
    return keywords


def detect_intent(text: str) -> str | None:
    normalized = normalize(text)
    for intent, markers in INTENTS.items():
        for marker in markers:
            if marker in normalized:
                return intent
    return None


def contains_emoji(text: str) -> bool:
    return bool(
        re.search(
            r"[\U0001F300-\U0001FAFF\u2600-\u27BF]",
            text,
        )
    )


def parse_dialogues(path: Path) -> list[DialoguePair]:
    pairs: list[DialoguePair] = []
    user_text = None

    with path.open(encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("User:"):
                user_text = line.split(":", 1)[1].strip()
            elif line.startswith("Bot:") and user_text:
                bot_text = line.split(":", 1)[1].strip()
                pairs.append(DialoguePair(user=user_text, bot=bot_text))
                user_text = None

    if not pairs:
        raise ValueError(f"Не удалось найти ни одной пары User/Bot в {path}")
    return pairs


def parse_dialogues_optional(path: Path) -> list[DialoguePair]:
    if not path.exists():
        return []
    return parse_dialogues(path)


def classify_question(text: str) -> str:
    normalized = normalize(text)
    if normalized.startswith(("что такое", "кто такой", "кто такая", "что значит")):
        return "definition"
    if normalized.startswith(("как ", "как", "каким образом")):
        return "how_to"
    if normalized.startswith(("почему", "зачем", "из за чего", "из-за чего")):
        return "why"
    if normalized.startswith(("можно ли", "умеешь ли", "сможешь ли", "ты можешь")):
        return "can"
    return "opinion"


def replace_number_words(text: str) -> str:
    result = text.lower().replace("ё", "е")
    for word, digit in NUMBER_WORDS.items():
        result = re.sub(rf"\b{word}\b", digit, result)
    return result


def safe_eval(expression: str) -> float | int:
    def _eval(node):
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in SAFE_OPERATORS:
            left = _eval(node.left)
            right = _eval(node.right)
            return SAFE_OPERATORS[type(node.op)](left, right)
        if isinstance(node, ast.UnaryOp) and type(node.op) in SAFE_OPERATORS:
            operand = _eval(node.operand)
            return SAFE_OPERATORS[type(node.op)](operand)
        raise ValueError("unsupported expression")

    tree = ast.parse(expression, mode="eval")
    return _eval(tree)


def augment_user_text(text: str) -> Iterable[str]:
    normalized = normalize(text)
    keywords = extract_keywords(text)
    variants = {
        text.strip(),
        normalized,
        " ".join(keywords),
        f"подскажи {normalized}".strip(),
        f"расскажи {normalized}".strip(),
        f"можешь помочь {normalized}".strip(),
    }
    return [variant for variant in variants if variant]


def build_index(dialogues: list[DialoguePair], target_samples: int = TARGET_SAMPLES) -> dict:
    random.seed(RANDOM_SEED)

    documents = []
    token_frequency = Counter()
    response_frequency = Counter()
    intent_to_responses = defaultdict(Counter)

    base_variants = []
    for pair in dialogues:
        variants = list(augment_user_text(pair.user))
        base_variants.append((pair, variants))

    total_variants = sum(len(variants) for _, variants in base_variants)
    repeat_factor = max(1, math.ceil(target_samples / max(total_variants, 1)))

    seen_documents = 0
    for pair, variants in base_variants:
        response_frequency[pair.bot] += repeat_factor * len(variants)
        intent = detect_intent(pair.user)
        if intent:
            intent_to_responses[intent][pair.bot] += repeat_factor * len(variants)

        for variant in variants:
            keywords = extract_keywords(variant)
            if not keywords:
                continue
            token_frequency.update(set(keywords))
            documents.append(
                {
                    "user": pair.user,
                    "bot": pair.bot,
                    "variant": variant,
                    "keywords": keywords,
                    "intent": intent,
                    "weight": repeat_factor,
                }
            )
            seen_documents += repeat_factor

    document_count = max(len(documents), 1)
    idf = {
        token: math.log((1 + document_count) / (1 + freq)) + 1.0
        for token, freq in token_frequency.items()
    }

    return {
        "version": INDEX_VERSION,
        "dialogues": [{"user": pair.user, "bot": pair.bot} for pair in dialogues],
        "documents": documents,
        "idf": idf,
        "response_frequency": dict(response_frequency),
        "intent_to_responses": {intent: dict(counter) for intent, counter in intent_to_responses.items()},
        "stats": {
            "dialogue_pairs": len(dialogues),
            "materialized_documents": len(documents),
            "virtual_training_samples": seen_documents,
            "target_samples": target_samples,
        },
    }


def append_memory_pair(user: str, bot: str, path: Path = MEMORY_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(f"User: {user.strip()}\n")
        handle.write(f"Bot: {bot.strip()}\n")


def merge_dialogues(base: list[DialoguePair], memory: list[DialoguePair]) -> list[DialoguePair]:
    merged = list(base)
    seen = {(normalize(pair.user), normalize(pair.bot)) for pair in base}
    for pair in memory:
        key = (normalize(pair.user), normalize(pair.bot))
        if key not in seen:
            merged.append(pair)
            seen.add(key)
    return merged


def load_user_profile(path: Path = PROFILE_FILE) -> dict:
    return load_state("user_profile", path)


def save_user_profile(profile: dict, path: Path = PROFILE_FILE) -> None:
    save_state("user_profile", profile, path)


def database_enabled() -> bool:
    return bool(os.getenv("DATABASE_URL", "")) and psycopg is not None


def init_database() -> None:
    if not database_enabled():
        return
    with psycopg.connect(os.getenv("DATABASE_URL", "")) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS app_state (
                    key TEXT PRIMARY KEY,
                    value JSONB NOT NULL DEFAULT '{}'::jsonb
                )
                """
            )
        conn.commit()


def load_state(key: str, fallback_path: Path) -> dict:
    if database_enabled():
        with psycopg.connect(os.getenv("DATABASE_URL", "")) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT value::text FROM app_state WHERE key = %s", (key,))
                row = cur.fetchone()
                if row:
                    return json.loads(row[0]) if row[0] else {}
        if fallback_path.exists():
            try:
                value = json.loads(fallback_path.read_text(encoding="utf-8"))
                save_state(key, value, fallback_path)
                return value
            except Exception:
                return {}
        return {}

    if not fallback_path.exists():
        return {}
    try:
        return json.loads(fallback_path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(key: str, value: dict, fallback_path: Path) -> None:
    if database_enabled():
        with psycopg.connect(os.getenv("DATABASE_URL", "")) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO app_state (key, value)
                    VALUES (%s, %s::jsonb)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                    """,
                    (key, json.dumps(value, ensure_ascii=False)),
                )
            conn.commit()
        return

    fallback_path.parent.mkdir(parents=True, exist_ok=True)
    fallback_path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def load_users(path: Path = USERS_FILE) -> dict:
    return load_state("users", path)


def save_users(users: dict, path: Path = USERS_FILE) -> None:
    save_state("users", users, path)


def load_chats(path: Path = CHATS_FILE) -> dict:
    return load_state("chats", path)


def save_chats(chats: dict, path: Path = CHATS_FILE) -> None:
    save_state("chats", chats, path)


def load_sessions(path: Path = SESSIONS_FILE) -> dict:
    return load_state("sessions", path)


def save_sessions(sessions: dict, path: Path = SESSIONS_FILE) -> None:
    save_state("sessions", sessions, path)


def ensure_user_record(username: str, users: dict) -> dict:
    user = users.setdefault(
        username,
        {
            "credits": DEFAULT_CREDITS,
            "referral_code": secrets.token_hex(4),
            "referred_by": None,
            "referrals": 0,
            "stats": {"messages_sent": 0, "searches_used": 0},
            "daily_stats": {},
            "task_day": "",
            "daily_claimed_tasks": [],
            "daily_completed_tasks": [],
            "last_daily_bonus_day": "",
            "claimed_tasks": [],
            "completed_tasks": [],
        },
    )
    user.setdefault("credits", DEFAULT_CREDITS)
    user.setdefault("referral_code", secrets.token_hex(4))
    user.setdefault("referred_by", None)
    user.setdefault("referrals", 0)
    user.setdefault("stats", {"messages_sent": 0, "searches_used": 0})
    user.setdefault("daily_stats", {})
    user.setdefault("task_day", "")
    user.setdefault("daily_claimed_tasks", [])
    user.setdefault("daily_completed_tasks", [])
    user.setdefault("last_daily_bonus_day", "")
    user.setdefault("claimed_tasks", [])
    user.setdefault("completed_tasks", [])
    ensure_daily_tasks(user)
    return user


def current_task_day() -> str:
    return dt.date.today().isoformat()


def apply_daily_login_bonus(user: dict) -> bool:
    day = current_task_day()
    if user.get("last_daily_bonus_day") == day:
        return False
    user["credits"] = user.get("credits", DEFAULT_CREDITS) + DAILY_LOGIN_BONUS
    user["last_daily_bonus_day"] = day
    return True


def serialize_user(user: dict, username: str, profile: dict, daily_bonus_awarded: bool = False) -> dict:
    return {
        "username": username,
        "credits": user.get("credits", DEFAULT_CREDITS),
        "referral_code": user.get("referral_code"),
        "referrals": user.get("referrals", 0),
        "tasks": task_state(user, profile),
        "daily_bonus_awarded": daily_bonus_awarded,
        "daily_bonus_amount": DAILY_LOGIN_BONUS if daily_bonus_awarded else 0,
    }


def generate_daily_tasks(day: str) -> list[dict]:
    seed = int(hashlib.sha256(day.encode("utf-8")).hexdigest(), 16)
    picker = random.Random(seed)
    tasks = list(TASK_POOL)
    picker.shuffle(tasks)
    return [dict(item) for item in tasks[:DAILY_TASK_COUNT]]


def ensure_daily_tasks(user: dict) -> None:
    day = current_task_day()
    if user.get("task_day") == day:
        return
    user["task_day"] = day
    user["daily_stats"] = {}
    user["daily_claimed_tasks"] = []
    user["daily_completed_tasks"] = []


def classify_message_stats(message: str, answer: str) -> dict[str, int]:
    normalized = normalize(message)
    events: dict[str, int] = {"messages_sent": 1}

    if "Я нашёл вот что:" in answer or "поискал в интернете" in answer:
        events["searches_used"] = 1
    if any(word in normalized.split() for word in ("привет", "здравствуй", "privet", "hi", "hello")):
        events["greetings"] = 1
    if any(phrase in normalized for phrase in ("меня зовут", "мое имя", "моё имя", "я daniel", "я даниел")):
        events["introductions"] = 1
    if any(word in normalized for word in ("анекдот", "шутк", "прикол", "мем")):
        events["joke_requests"] = 1
    if any(word in normalized for word in ("код", "python", "js", "javascript", "программ", "бот", "api")):
        events["code_questions"] = 1
    if any(word in normalized for word in ("спасибо", "thanks", "thx", "благодар")):
        events["thanks_sent"] = 1
    if any(word in normalized for word in ("нормально", "хорошо", "плохо", "отлично", "грустно", "весело")):
        events["mood_updates"] = 1
    if any(word in normalized for word in ("придумай", "историю", "идею", "сценарий", "рассказ")):
        events["creative_requests"] = 1
    if len(message.strip()) >= 40:
        events["long_messages"] = 1
    if "?" in message or any(phrase in normalized for phrase in ("что такое", "почему", "как", "зачем", "когда")):
        events["knowledge_questions"] = 1
    if re.search(r"\d+\s*[\+\-\*/xх]\s*\d+", normalized) or any(
        phrase in normalized for phrase in ("сколько будет", "чему равно", "умножить", "плюс", "минус")
    ):
        events["math_questions"] = 1

    return events


def task_state(user: dict, profile: dict | None = None) -> list[dict]:
    ensure_daily_tasks(user)
    stats = user.get("daily_stats", {})
    profile = profile or {}
    completed = set(user.get("daily_completed_tasks", []))
    claimed = set(user.get("daily_claimed_tasks", []))
    tasks = generate_daily_tasks(user["task_day"])

    for task in tasks:
        progress_value = stats.get(task["kind"], 0)
        if task["id"] == "intro_1" and profile.get("name"):
            progress_value = max(progress_value, 1)
        if progress_value >= task["target"]:
            completed.add(task["id"])

    user["daily_completed_tasks"] = sorted(completed)

    result = []
    for meta in tasks:
        progress_value = stats.get(meta["kind"], 0)
        if meta["id"] == "intro_1" and profile.get("name"):
            progress_value = max(progress_value, 1)
        result.append(
            {
                "id": meta["id"],
                "title": meta["title"],
                "description": meta["description"],
                "reward": meta["reward"],
                "completed": meta["id"] in completed,
                "claimed": meta["id"] in claimed,
                "progress": progress_value,
                "target": meta["target"],
            }
        )
    return result


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()
    return salt, digest


def verify_password(password: str, salt: str, password_hash: str) -> bool:
    _, digest = hash_password(password, salt=salt)
    return secrets.compare_digest(digest, password_hash)


def serpapi_search(query: str, max_results: int = 3) -> list[str]:
    serpapi_key = os.getenv("SERPAPI_KEY", "")
    if not serpapi_key:
        return []

    params = urllib.parse.urlencode(
        {
            "engine": "google",
            "q": query,
            "api_key": serpapi_key,
            "hl": "ru",
            "num": max_results,
        }
    )
    url = f"{SERPAPI_ENDPOINT}?{params}"
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return []

    snippets = []
    for item in payload.get("organic_results", [])[:max_results]:
        snippet = item.get("snippet") or item.get("title")
        if snippet:
            snippets.append(snippet.strip())
    return snippets


class SmartChatBot:
    def __init__(self, index: dict):
        self.documents = index["documents"]
        self.idf = index["idf"]
        self.response_frequency = Counter(index["response_frequency"])
        self.intent_to_responses = {
            intent: Counter(responses)
            for intent, responses in index["intent_to_responses"].items()
        }
        self.stats = index["stats"]
        self.dialogues = index.get("dialogues", [])
        self.history: list[tuple[str, str]] = []
        self.learn_from_chat = False
        self.user_profile = load_user_profile()
        self.awaiting_search_query = False

    def _vectorize(self, text: str) -> Counter:
        vector = Counter()
        for token in extract_keywords(text):
            vector[token] += self.idf.get(token, 1.0)
        return vector

    def _is_bot_directed(self, message: str) -> bool:
        normalized = normalize(message)
        bot_markers = ("ты ", "ты?", "тебя", "тебе", "о тебе", "твой", "твоя", "сам", "бот")
        return any(marker in normalized for marker in bot_markers)

    def _direct_answer(self, message: str) -> str | None:
        normalized = replace_number_words(message)
        normalized = normalized.replace("сколько будет", "").replace("чему равно", "").strip()
        normalized = (
            normalized.replace("плюс", "+")
            .replace("минус", "-")
            .replace("умножить на", "*")
            .replace("разделить на", "/")
            .replace("х", "*")
            .replace("x", "*")
        )
        expression = re.sub(r"[^0-9+\-*/(). ]", " ", normalized)
        expression = re.sub(r"\s+", "", expression)

        if expression and re.fullmatch(r"[0-9+\-*/().]+", expression) and any(op in expression for op in "+-*/"):
            try:
                result = safe_eval(expression)
                if isinstance(result, float) and result.is_integer():
                    result = int(result)
                return self._add_emoji(f"Ответ: {result}.", message)
            except Exception:
                pass

        if "столица франции" in normalized:
            return "Столица Франции - Париж 🇫🇷"
        if "столица японии" in normalized:
            return "Столица Японии - Токио 🇯🇵"
        if "столица италии" in normalized:
            return "Столица Италии - Рим 🇮🇹"
        if "сколько часов в сутках" in normalized:
            return "В сутках 24 часа ⏰"

        return None

    def _bot_meta_answer(self, message: str) -> str | None:
        normalized = normalize(message)

        if any(phrase in normalized for phrase in ("кто ты", "что ты", "ты кто")):
            return self._add_emoji(BOT_META_RESPONSES["who"], message)

        if any(
            phrase in normalized
            for phrase in ("как создан", "как ты создан", "как тебя создали", "как сделан", "ты как создан")
        ):
            return self._add_emoji(BOT_META_RESPONSES["how_created"], message)

        if any(
            phrase in normalized
            for phrase in ("как работаешь", "как ты работаешь", "по какому принципу работаешь", "как отвечаешь")
        ):
            return self._add_emoji(BOT_META_RESPONSES["how_work"], message)

        if any(
            phrase in normalized
            for phrase in (
                "ищешь в интернете",
                "можешь искать в интернете",
                "умеешь искать в интернете",
                "можешь в интернет",
                "умеешь в интернет",
                "есть поиск в интернете",
            )
        ):
            self.awaiting_search_query = True
            if os.getenv("SERPAPI_KEY", "") and os.getenv("SERPAPI_KEY", "") != "put_your_serpapi_key_here":
                return self._add_emoji(BOT_META_RESPONSES["internet_yes"], message)
            return self._add_emoji(BOT_META_RESPONSES["internet_no"], message)

        if any(phrase in normalized for phrase in ("ты нормальный", "ты норм", "ты адекватный", "ты вообще нормальный")):
            return self._add_emoji(
                "Я не человек, но стараюсь отвечать адекватно, по делу и без лишней ерунды",
                message,
            )

        if any(phrase in normalized for phrase in ("ты живой", "ты человек", "ты настоящий")):
            return self._add_emoji(
                "Я не живой человек. Я программа, которая анализирует запрос и формирует ответ",
                message,
            )

        return None

    def _personal_reply(self, message: str) -> str | None:
        normalized = normalize(message)

        if normalized.startswith(("меня зовут ", "мое имя ")):
            name = self.user_profile.get("name")
            if name:
                return self._add_emoji(f"Приятно познакомиться, {name}. Запомнил тебя.", message)
            return self._add_emoji("Приятно познакомиться. Запомнил твоё имя.", message)

        if normalized.startswith(("я люблю ", "мне нравится ")):
            return self._add_emoji("Круто. Запомнил это и постараюсь учитывать в разговоре.", message)

        if normalized.startswith(("я занимаюсь ", "я работаю ")):
            return self._add_emoji("Понял. Это полезный контекст, я буду иметь его в виду.", message)

        return None

    def _search_command(self, message: str) -> str | None:
        stripped = message.strip()
        lowered = normalize(stripped)
        prefixes = ("ищи ", "search ", "найди ")
        query = None
        for prefix in prefixes:
            if lowered.startswith(prefix):
                query = stripped.split(" ", 1)[1].strip() if " " in stripped else ""
                break
        if not query:
            return None

        snippets = serpapi_search(query)
        if not snippets:
            if os.getenv("SERPAPI_KEY", ""):
                return "Я поискал, но нормального ответа не нашёл. Попробуй уточнить запрос. 🌐"
            return "Поиск не настроен. Добавь `SERPAPI_KEY` в переменные окружения, и я смогу искать в интернете. 🌐"

        answer = "Я нашёл вот что: " + " ".join(snippets[:2])
        return self._add_emoji(answer, message)

    def _auto_search_answer(self, message: str) -> str | None:
        if self._is_bot_directed(message):
            return None
        if self._personal_reply(message):
            return None
        if not os.getenv("SERPAPI_KEY", "") or os.getenv("SERPAPI_KEY", "") == "put_your_serpapi_key_here":
            return None

        normalized = normalize(message)
        if detect_intent(message) in {"greeting", "thanks", "bye", "laugh", "state_good", "state_bad"}:
            return None
        if len(extract_keywords(message)) < 2:
            return None

        snippets = serpapi_search(normalized, max_results=2)
        if not snippets:
            return None

        answer = "Я не был уверен, поэтому поискал в интернете. Вот что нашёл: " + " ".join(snippets)
        return self._add_emoji(answer, message)

    def _extract_search_followup(self, message: str) -> str | None:
        normalized = normalize(message)
        prefixes = (
            "хочу чтобы ты нашел ",
            "хочу чтобы ты нашел че такое ",
            "хочу чтобы ты нашел что такое ",
            "хочу чтобы ты искал ",
            "хочу чтобы ты поискал ",
            "что такое ",
            "че такое ",
            "найди ",
            "ищи ",
        )
        for prefix in prefixes:
            if normalized.startswith(prefix):
                query = normalized[len(prefix):].strip()
                if query:
                    return query
        return None

    @staticmethod
    def _cosine_similarity(left: Counter, right: Counter) -> float:
        if not left or not right:
            return 0.0
        common = set(left) & set(right)
        dot = sum(left[token] * right[token] for token in common)
        left_norm = math.sqrt(sum(value * value for value in left.values()))
        right_norm = math.sqrt(sum(value * value for value in right.values()))
        if not left_norm or not right_norm:
            return 0.0
        return dot / (left_norm * right_norm)

    def _best_matches(self, message: str, top_k: int = TOP_K) -> list[tuple[float, dict]]:
        message_vector = self._vectorize(message)
        intent = detect_intent(message)
        scored = []

        for document in self.documents:
            doc_vector = Counter({token: self.idf.get(token, 1.0) for token in document["keywords"]})
            score = self._cosine_similarity(message_vector, doc_vector)

            overlap = len(set(extract_keywords(message)) & set(document["keywords"]))
            score += min(overlap * 0.06, 0.24)

            if intent and document["intent"] == intent:
                score += 0.10

            if normalize(message) == normalize(document["user"]):
                score += 0.30

            if score > 0:
                scored.append((score, document))

        scored.sort(key=lambda item: item[0], reverse=True)
        return scored[:top_k]

    def _fallback(self, message: str) -> str:
        intent = detect_intent(message)
        if intent and self.intent_to_responses.get(intent):
            return self._add_emoji(self.intent_to_responses[intent].most_common(1)[0][0], message)

        variants = FALLBACKS.get(intent or "default", FALLBACKS["default"])
        return self._add_emoji(random.choice(variants), message)

    def _pick_topic(self, message: str) -> str:
        keywords = [token for token in tokenize(message) if token not in STOPWORDS]
        if not keywords:
            return "этой теме"
        return " ".join(keywords[:3])

    def _supporting_idea(self, message: str, matches: list[tuple[float, dict]]) -> str:
        question_type = classify_question(message)
        if self._is_bot_directed(message):
            return "здесь лучше ответить прямо, человечески и без шаблонного ухода в сторону"
        if self._personal_reply(message):
            return "здесь лучше ответить тепло, коротко и по-человечески"
        if matches:
            query_keywords = set(extract_keywords(message))
            required_overlap = max(1, min(2, len(query_keywords)))
            for score, document in matches:
                overlap = len(query_keywords & set(document["keywords"]))
                if overlap >= required_overlap and score >= 0.40:
                    best_text = re.sub(r"\s+", " ", document["bot"]).strip()
                    if len(best_text) > 140:
                        best_text = best_text[:137].rstrip(" ,.;:") + "..."
                    return best_text

        intent = detect_intent(message)
        if intent == "coding":
            return "если речь про код, начни с структуры проекта, потом определи команды, обработчики и минимальный рабочий сценарий"
        if intent and intent in {"stress", "state_bad"}:
            return "обычно помогает снизить нагрузку, сузить задачу до одного шага и убрать лишние отвлечения"
        return DEFAULT_SUPPORT_BY_TYPE[question_type]

    def _generate_joke(self, message: str) -> str:
        topic = self._pick_topic(message)
        subject = random.choice(JOKE_SUBJECTS)
        place = random.choice(JOKE_PLACES)
        punch = random.choice(JOKE_PUNCHES)
        template = random.choice(JOKE_TEMPLATES)
        answer = template.format(subject=subject, topic=topic, place=place, punch=punch)
        return self._add_emoji(answer, message)

    def _generate_story(self, message: str) -> str:
        topic = self._pick_topic(message)
        opener = random.choice(STORY_OPENERS)
        hero = random.choice(STORY_HEROES)
        goal = random.choice(STORY_GOALS)
        twist = random.choice(STORY_TWISTS)
        answer = (
            f"{opener} {hero} решил {goal} про {topic}, "
            f"{twist}. В конце он понял, что лучший результат приходит, когда не бросаешь задачу после первой ошибки."
        )
        return self._add_emoji(answer, message)

    def _generate_creative_reply(self, message: str, matches: list[tuple[float, dict]]) -> str | None:
        normalized = normalize(message)
        if any(word in normalized for word in ("анекдот", "шутк", "прикол", "смешн")):
            return self._generate_joke(message)
        if any(word in normalized for word in ("истори", "сказк", "сюжет", "придумай")):
            return self._generate_story(message)
        return None

    def _extract_user_facts(self, message: str) -> None:
        normalized = message.strip()
        changed = False
        for pattern, key in FACT_PATTERNS:
            match = pattern.search(normalized)
            if not match:
                continue
            value = match.group(1).strip(" .!?")
            if not value:
                continue
            if key == "likes":
                likes = self.user_profile.setdefault("likes", [])
                if value not in likes:
                    likes.append(value)
                    self.user_profile["likes"] = likes[-10:]
                    changed = True
            else:
                if self.user_profile.get(key) != value:
                    self.user_profile[key] = value
                    changed = True
        if changed:
            save_user_profile(self.user_profile)

    def _profile_hint(self) -> str:
        parts = []
        if self.user_profile.get("name"):
            parts.append(f"тебя зовут {self.user_profile['name']}")
        if self.user_profile.get("activity"):
            parts.append(f"ты занимаешься {self.user_profile['activity']}")
        likes = self.user_profile.get("likes") or []
        if likes:
            parts.append(f"тебе нравится {likes[-1]}")
        return ", ".join(parts)

    def _evidence_lines(self, message: str, matches: list[tuple[float, dict]]) -> list[str]:
        if self._is_bot_directed(message):
            return []
        evidence = []
        query_keywords = set(extract_keywords(message))
        for score, document in matches:
            overlap = len(query_keywords & set(document["keywords"]))
            if score >= 0.45 and overlap >= max(1, min(2, len(query_keywords))):
                text = re.sub(r"\s+", " ", document["bot"]).strip()
                if text and text not in evidence:
                    evidence.append(text)
            if len(evidence) >= 2:
                break
        return evidence

    def _analyze_message(self, message: str, matches: list[tuple[float, dict]]) -> dict:
        return {
            "question_type": classify_question(message),
            "intent": detect_intent(message),
            "topic": self._pick_topic(message),
            "support": self._supporting_idea(message, matches),
            "evidence": self._evidence_lines(message, matches),
            "profile_hint": self._profile_hint(),
            "bot_directed": self._is_bot_directed(message),
        }

    def _build_reasoned_candidates(self, analysis: dict) -> list[str]:
        question_type = analysis["question_type"]
        topic = analysis["topic"]
        support = analysis["support"]
        evidence = analysis["evidence"]
        profile_hint = analysis["profile_hint"]
        bot_directed = analysis["bot_directed"]
        opener = random.choice(GENERIC_OPENERS[question_type])
        closer = random.choice(GENERIC_CLOSERS)
        evidence_line = evidence[0] if evidence else support

        candidates = []
        if question_type == "definition":
            candidates.append(
                f"{opener} {topic} лучше понимать через определение, простой пример и практическое применение. {evidence_line}. {closer}"
            )
            candidates.append(
                f"{topic.capitalize()} можно объяснить так: сначала смысл, потом пример, потом зачем это нужно. {support}. {closer}"
            )
        elif question_type == "how_to":
            candidates.append(
                f"{opener} сначала зафиксируй цель, потом выбери минимальный первый шаг и проверь результат. {evidence_line}. {closer}"
            )
            candidates.append(
                f"Я бы пошёл так: разбил бы задачу на короткие шаги, сделал первый прямо сейчас и только потом усложнял. {support}. {closer}"
            )
        elif question_type == "why":
            candidates.append(
                f"{opener} обычно причина не одна, а несколько факторов сразу. {evidence_line}. {closer}"
            )
            candidates.append(
                f"Если смотреть трезво, тут влияет сочетание условий, привычек и контекста. {support}. {closer}"
            )
        elif question_type == "can":
            candidates.append(
                f"Да, это реально. Обычно лучше начать с минимальной рабочей версии и улучшать по шагам. {evidence_line}. {closer}"
            )
            candidates.append(
                f"Да, можно. Вопрос скорее в том, как зайти в задачу без лишней сложности с самого начала. {support}. {closer}"
            )
        else:
            candidates.append(
                f"Я бы ответил так: сначала надо понять цель вопроса, затем ограничения, а потом выбрать самый практичный ход. {evidence_line}. {closer}"
            )
            candidates.append(
                f"Если говорить прямо про {topic}, я бы опирался на смысл, пользу и ближайшее действие. {support}. {closer}"
            )
            candidates.append(
                f"Если отвечать по-человечески, то всё зависит от того, что именно ты имеешь в виду. Но в целом я бы сказал так: {support}. {closer}"
            )

        if bot_directed:
            candidates.append(
                f"Если коротко, отвечу прямо: {support}. {closer}"
            )

        if profile_hint and analysis["intent"] not in {"greeting", "thanks", "bye"}:
            if bot_directed:
                return candidates
            candidates.append(
                f"С учетом того, что {profile_hint}, я бы делал ставку на понятный первый шаг и практику без перегруза. {support}. {closer}"
            )
        return candidates

    def _score_candidate(self, message: str, candidate: str, analysis: dict) -> float:
        score = 0.0
        query_tokens = set(extract_keywords(message))
        candidate_tokens = set(extract_keywords(candidate))
        score += len(query_tokens & candidate_tokens) * 0.12
        score += 0.20 if analysis["evidence"] else 0.0
        score += 0.05 if analysis["profile_hint"] and "с учетом" in candidate.lower() else 0.0
        score -= max(len(candidate) - 260, 0) / 250
        return score

    def _generate_freeform_answer(self, message: str, matches: list[tuple[float, dict]]) -> str:
        analysis = self._analyze_message(message, matches)
        candidates = self._build_reasoned_candidates(analysis)
        answer = max(candidates, key=lambda candidate: self._score_candidate(message, candidate, analysis))
        answer = re.sub(r"\s+", " ", answer).strip()
        if not answer.endswith((".", "!", "?")):
            answer += "."
        return self._add_emoji(answer, message)

    def _short_uncertain_answer(self, message: str) -> str:
        if self._is_bot_directed(message):
            return self._add_emoji("Скажи конкретнее.", message)
        return self._add_emoji("Не понял. Напиши конкретнее.", message)

    def _should_use_direct_match(self, message: str, match: tuple[float, dict]) -> bool:
        _, document = match
        return normalize(message) == normalize(document["user"])

    def _add_emoji(self, answer: str, message: str) -> str:
        if contains_emoji(answer):
            return answer

        intent = detect_intent(message) or detect_intent(answer) or "default"
        emoji = random.choice(EMOJI_BY_INTENT.get(intent, EMOJI_BY_INTENT["default"]))
        if answer.endswith(("!", "?", ".")):
            return f"{answer} {emoji}"
        return f"{answer} {emoji}"

    def _context_reply(self, message: str) -> str | None:
        normalized = normalize(message)
        intent = detect_intent(message)
        previous_user = self.history[-1][0] if self.history else ""
        previous_intent = detect_intent(previous_user) if previous_user else None

        if intent == "greeting":
            return self._add_emoji("Привет. Как дела?", message)

        if intent == "thanks":
            return self._add_emoji("Пожалуйста", message)

        if intent == "bye":
            return self._add_emoji("До связи", message)

        if normalized in {"как дела", "как ты"}:
            return self._add_emoji("У меня всё хорошо. А у тебя как настроение?", message)

        if intent == "state_good" and previous_intent == "greeting":
            return self._add_emoji("Отлично. Если хочешь, можем поболтать или перейти к делу", message)

        if intent == "laugh":
            return self._add_emoji("Люблю, когда шутка попадает в точку", message)

        if intent == "coding":
            return self._generate_freeform_answer(message, self._best_matches(message))

        if normalized in {"норм", "нормально", "все нормально", "всё нормально"}:
            return self._add_emoji("Хорошо. Что дальше: поболтаем, пошутим или разберём задачу?", message)

        if normalized in {"ок", "понятно", "ясно"}:
            return self._add_emoji("Если хочешь, можем продолжить. Просто напиши, что интересно", message)

        return None

    def reply(self, message: str) -> str:
        cleaned = message.strip()
        if not cleaned:
            return "Напиши вопрос или тему, и я отвечу."
        self._extract_user_facts(cleaned)

        implicit_query = self._extract_search_followup(cleaned)
        if implicit_query:
            search = self._search_command(f"ищи {implicit_query}")
            if search:
                self.history.append((cleaned, search))
                self.history = self.history[-8:]
                return search

        if self.awaiting_search_query:
            query = self._extract_search_followup(cleaned) or normalize(cleaned)
            self.awaiting_search_query = False
            search = self._search_command(f"ищи {query}")
            if search:
                self.history.append((cleaned, search))
                self.history = self.history[-8:]
                return search

        search = self._search_command(cleaned)
        if search:
            self.history.append((cleaned, search))
            self.history = self.history[-8:]
            return search

        direct = self._direct_answer(cleaned)
        if direct:
            self.history.append((cleaned, direct))
            self.history = self.history[-8:]
            return direct

        personal = self._personal_reply(cleaned)
        if personal:
            self.history.append((cleaned, personal))
            self.history = self.history[-8:]
            return personal

        meta = self._bot_meta_answer(cleaned)
        if meta:
            self.history.append((cleaned, meta))
            self.history = self.history[-8:]
            return meta

        contextual = self._context_reply(cleaned)
        if contextual:
            self.history.append((cleaned, contextual))
            self.history = self.history[-8:]
            return contextual

        creative = self._generate_creative_reply(cleaned, [])
        if creative:
            self.history.append((cleaned, creative))
            self.history = self.history[-8:]
            return creative

        matches = self._best_matches(cleaned)
        if not matches or matches[0][0] < MIN_SCORE:
            auto_search = self._auto_search_answer(cleaned)
            if auto_search:
                self.history.append((cleaned, auto_search))
                self.history = self.history[-8:]
                return auto_search
            if len(extract_keywords(cleaned)) <= 3:
                answer = self._short_uncertain_answer(cleaned)
            else:
                answer = self._generate_freeform_answer(cleaned, matches)
            self.history.append((cleaned, answer))
            self.history = self.history[-8:]
            return answer

        best_score, best_doc = matches[0]
        if self._should_use_direct_match(cleaned, matches[0]):
            answer = self._add_emoji(best_doc["bot"], cleaned)
            self.history.append((cleaned, answer))
            self.history = self.history[-8:]
            return answer

        if matches[0][0] < 0.32:
            auto_search = self._auto_search_answer(cleaned)
            if auto_search:
                self.history.append((cleaned, auto_search))
                self.history = self.history[-8:]
                return auto_search

        answer = self._generate_freeform_answer(cleaned, matches)
        self.history.append((cleaned, answer))
        self.history = self.history[-8:]
        return answer


def save_index(index: dict, path: Path = INDEX_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")


def load_index(path: Path = INDEX_FILE) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def train(data_file: Path = DATA_FILE, target_samples: int = TARGET_SAMPLES, force: bool = False) -> dict:
    if INDEX_FILE.exists() and not force:
        cached = load_index(INDEX_FILE)
        if cached.get("version") == INDEX_VERSION:
            return cached

    dialogues = parse_dialogues(data_file)
    index = build_index(dialogues, target_samples=target_samples)
    save_index(index, INDEX_FILE)
    return index


def run_chat(bot: SmartChatBot) -> None:
    print("=== fluxa-ai Smart Chat ===")
    print("Напиши 'выход', чтобы завершить.")
    print(
        f"База: {bot.stats['dialogue_pairs']} диалогов, "
        f"{bot.stats['virtual_training_samples']} виртуальных обучающих примеров."
    )

    while True:
        message = input("Ты: ").strip()
        if normalize(message) in {"выход", "exit", "quit"}:
            print("Bot: До связи.")
            break
        print("Bot:", bot.reply(message))


def make_handler(bot: SmartChatBot, web_dir: Path):
    users = load_users()
    chats = load_chats()
    sessions = load_sessions()

    class ChatHandler(BaseHTTPRequestHandler):
        def _send_json(self, payload: dict, status: int = 200, headers: dict | None = None) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            if headers:
                for key, value in headers.items():
                    self.send_header(key, value)
            self.end_headers()
            self.wfile.write(body)

        def _send_file(self, path: Path, content_type: str) -> None:
            if not path.exists():
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            body = path.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _read_json(self) -> dict | None:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            try:
                return json.loads(raw.decode("utf-8"))
            except Exception:
                return None

        def _cookie_token(self) -> str | None:
            header = self.headers.get("Cookie")
            if not header:
                return None
            cookie = SimpleCookie()
            cookie.load(header)
            morsel = cookie.get("fluxa_ai_session")
            return morsel.value if morsel else None

        def _current_user(self) -> dict | None:
            token = self._cookie_token()
            if not token:
                return None
            username = sessions.get(token)
            if not username:
                return None
            user = users.get(username)
            if not user:
                return None
            ensure_user_record(username, users)
            daily_bonus_awarded = apply_daily_login_bonus(user)
            if daily_bonus_awarded:
                save_users(users)
            profile = load_user_profile()
            return serialize_user(user, username, profile, daily_bonus_awarded=daily_bonus_awarded)

        def do_GET(self) -> None:
            if self.path in {"/", "/index.html"}:
                return self._send_file(web_dir / "index.html", "text/html; charset=utf-8")
            if self.path == "/app.js":
                return self._send_file(web_dir / "app.js", "application/javascript; charset=utf-8")
            if self.path == "/styles.css":
                return self._send_file(web_dir / "styles.css", "text/css; charset=utf-8")
            if self.path == "/api/health":
                return self._send_json({"ok": True})
            if self.path == "/api/me":
                user = self._current_user()
                history = chats.get(user["username"], []) if user else []
                return self._send_json({"user": user, "history": history})
            self.send_error(HTTPStatus.NOT_FOUND)

        def do_POST(self) -> None:
            if self.path == "/api/register":
                payload = self._read_json()
                if payload is None:
                    return self._send_json({"error": "Invalid JSON"}, status=400)
                username = str(payload.get("username", "")).strip()
                password = str(payload.get("password", "")).strip()
                if len(username) < 3 or len(password) < 4:
                    return self._send_json({"error": "Логин от 3 символов, пароль от 4."}, status=400)
                if username in users:
                    return self._send_json({"error": "Такой пользователь уже существует."}, status=400)
                referral_code = str(payload.get("referral_code", "")).strip()
                salt, password_hash = hash_password(password)
                users[username] = {
                    "salt": salt,
                    "password_hash": password_hash,
                    "credits": DEFAULT_CREDITS,
                    "referral_code": secrets.token_hex(4),
                    "referred_by": None,
                    "referrals": 0,
                    "stats": {"messages_sent": 0, "searches_used": 0},
                    "daily_stats": {},
                    "task_day": "",
                    "daily_claimed_tasks": [],
                    "daily_completed_tasks": [],
                    "last_daily_bonus_day": "",
                    "claimed_tasks": [],
                    "completed_tasks": [],
                }
                new_user = users[username]
                apply_daily_login_bonus(new_user)
                if referral_code:
                    for existing_username, existing_user in users.items():
                        if existing_username == username:
                            continue
                        if existing_user.get("referral_code") == referral_code:
                            new_user["referred_by"] = existing_username
                            new_user["credits"] += REFERRAL_BONUS
                            existing_user["credits"] = existing_user.get("credits", DEFAULT_CREDITS) + REFERRAL_BONUS
                            existing_user["referrals"] = existing_user.get("referrals", 0) + 1
                            break
                save_users(users)
                token = secrets.token_hex(24)
                sessions[token] = username
                save_sessions(sessions)
                response_user = serialize_user(users[username], username, load_user_profile(), daily_bonus_awarded=True)
                return self._send_json(
                    {"ok": True, "user": response_user},
                    headers={"Set-Cookie": f"fluxa_ai_session={token}; HttpOnly; Path=/; SameSite=Lax"},
                )

            if self.path == "/api/login":
                payload = self._read_json()
                if payload is None:
                    return self._send_json({"error": "Invalid JSON"}, status=400)
                username = str(payload.get("username", "")).strip()
                password = str(payload.get("password", "")).strip()
                user = users.get(username)
                if not user or not verify_password(password, user["salt"], user["password_hash"]):
                    return self._send_json({"error": "Неверный логин или пароль."}, status=401)
                ensure_user_record(username, users)
                daily_bonus_awarded = apply_daily_login_bonus(user)
                save_users(users)
                token = secrets.token_hex(24)
                sessions[token] = username
                save_sessions(sessions)
                response_user = serialize_user(users[username], username, load_user_profile(), daily_bonus_awarded)
                return self._send_json(
                    {"ok": True, "user": response_user},
                    headers={"Set-Cookie": f"fluxa_ai_session={token}; HttpOnly; Path=/; SameSite=Lax"},
                )

            if self.path == "/api/logout":
                token = self._cookie_token()
                if token and token in sessions:
                    sessions.pop(token, None)
                    save_sessions(sessions)
                return self._send_json(
                    {"ok": True},
                    headers={"Set-Cookie": "fluxa_ai_session=; Max-Age=0; Path=/; SameSite=Lax"},
                )

            if self.path == "/api/tasks/claim":
                current = self._current_user()
                if not current:
                    return self._send_json({"error": "Нужен вход в аккаунт."}, status=401)
                payload = self._read_json()
                if payload is None:
                    return self._send_json({"error": "Invalid JSON"}, status=400)
                task_id = str(payload.get("task_id", "")).strip()
                username = current["username"]
                user = ensure_user_record(username, users)
                current_tasks = {item["id"]: item for item in task_state(user, load_user_profile())}
                task = current_tasks.get(task_id)
                if not task:
                    return self._send_json({"error": "Такого задания нет."}, status=404)
                if not task["completed"]:
                    return self._send_json({"error": "Задание ещё не выполнено."}, status=400)
                if task["claimed"]:
                    return self._send_json({"error": "Награда уже получена."}, status=400)
                user.setdefault("daily_claimed_tasks", []).append(task_id)
                user["credits"] = user.get("credits", DEFAULT_CREDITS) + task["reward"]
                save_users(users)
                return self._send_json({"ok": True, "user": self._current_user()})

            if self.path == "/api/chat/clear":
                current = self._current_user()
                if not current:
                    return self._send_json({"error": "Нужен вход в аккаунт."}, status=401)
                username = current["username"]
                chats[username] = []
                save_chats(chats)
                return self._send_json({"ok": True})

            if self.path != "/api/chat":
                self.send_error(HTTPStatus.NOT_FOUND)
                return

            current = self._current_user()
            if not current:
                return self._send_json({"error": "Нужен вход в аккаунт."}, status=401)

            payload = self._read_json()
            if payload is None:
                return self._send_json({"error": "Invalid JSON"}, status=400)

            message = str(payload.get("message", "")).strip()
            if not message:
                return self._send_json({"error": "Empty message"}, status=400)

            username = current["username"]
            user = ensure_user_record(username, users)
            if user.get("credits", DEFAULT_CREDITS) < MESSAGE_COST:
                return self._send_json({"error": "Кредиты закончились. Выполни задания или пригласи друга."}, status=402)

            answer = bot.reply(message)
            user["credits"] -= MESSAGE_COST
            ensure_daily_tasks(user)
            for key, amount in classify_message_stats(message, answer).items():
                user["stats"][key] = user["stats"].get(key, 0) + amount
                user["daily_stats"][key] = user["daily_stats"].get(key, 0) + amount
            chats.setdefault(username, []).extend(
                [
                    {"role": "user", "text": message},
                    {"role": "bot", "text": answer},
                ]
            )
            chats[username] = chats[username][-100:]
            task_state(user, load_user_profile())
            save_users(users)
            save_chats(chats)
            return self._send_json({"reply": answer, "user": self._current_user()})

        def log_message(self, format: str, *args) -> None:
            return

    return ChatHandler


def run_web(bot: SmartChatBot, host: str = "127.0.0.1", port: int = 8000) -> None:
    web_dir = Path("web")
    handler = make_handler(bot, web_dir)
    server = ThreadingHTTPServer((host, port), handler)
    print(f"Web chat: http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Практичный чат-бот на основе data.txt")
    parser.add_argument("--train", action="store_true", help="Перестроить индекс")
    parser.add_argument("--chat", action="store_true", help="После загрузки перейти в интерактивный чат")
    parser.add_argument("--web", action="store_true", help="Запустить веб-чат")
    parser.add_argument("--host", type=str, default=os.getenv("HOST", "127.0.0.1"), help="Хост для веб-чата")
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8000")), help="Порт для веб-чата")
    parser.add_argument(
        "--samples",
        type=int,
        default=TARGET_SAMPLES,
        help="Целевое число виртуальных обучающих примеров",
    )
    parser.add_argument("--ask", type=str, help="Ответить на один вопрос и выйти")
    return parser.parse_args()


def main() -> None:
    load_dotenv()
    init_database()
    args = parse_args()
    index = train(target_samples=args.samples, force=args.train)
    bot = SmartChatBot(index)

    if args.ask:
        print(bot.reply(args.ask))
        return

    if args.train and not args.chat:
        print(
            f"Индекс обновлен: {bot.stats['dialogue_pairs']} диалогов, "
            f"{bot.stats['virtual_training_samples']} виртуальных примеров."
        )
        return

    if args.web:
        run_web(bot, host=args.host, port=args.port)
        return

    run_chat(bot)


if __name__ == "__main__":
    main()
