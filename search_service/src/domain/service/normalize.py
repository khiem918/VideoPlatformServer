import re
import unidecode
import emoji

_URL_RE = re.compile(
    r'(?:https?://|ftp://|www\.)\S+|'
    r'\S+\.(?:com|net|org|io|vn|edu|gov|co|me|tv|info|biz)\S*',
    re.IGNORECASE,
)

def normalize_desc(text: str) -> str:
    if not text:
        return ""

    text = emoji.replace_emoji(text, replace=' ')

    text = '\n'.join(
        line for line in text.splitlines() if not _URL_RE.search(line)
    )

    text = text.lower()

    text = unidecode.unidecode(text)

    text = re.sub(r'[^a-z0-9\s]', ' ', text)

    text = re.sub(r'[ \t]+', ' ', text)

    text = '. '.join(line.strip() for line in text.splitlines() if line.strip())

    return text.strip()


def normalize_title(text: str) -> str: 
    if not text:
        return ""

    text = emoji.replace_emoji(text, replace=' ')

    text = text.lower()

    text = unidecode.unidecode(text)

    text = re.sub(r'[^a-z0-9\s]', ' ', text)

    text = re.sub(r'[ \t]+', ' ', text)

    return text.strip()


def normalize_search_query(text: str) -> str:
    if not text:
        return ""

    text = emoji.replace_emoji(text, replace=' ')

    text = text.lower()

    text = unidecode.unidecode(text)

    text = re.sub(r'[^a-z0-9\s]', ' ', text)

    text = re.sub(r'[ \t]+', ' ', text)

    return text.strip()
