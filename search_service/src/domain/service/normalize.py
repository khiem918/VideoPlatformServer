import re
import unidecode
import emoji
import hashlib

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


def standard_normalize(text: str) -> str: 
    if not text:
        return ""

    text = emoji.replace_emoji(text, replace=' ')

    text = text.lower()

    text = unidecode.unidecode(text)

    text = re.sub(r'[^a-z0-9\s]', ' ', text)

    text = re.sub(r'[ \t]+', ' ', text)

    return text.strip()


def normalize_query_to_id(text: str) -> str:
    if not text:
        return ""

    text = emoji.replace_emoji(text, replace='-')

    text = text.lower()

    text = unidecode.unidecode(text)

    text = re.sub(r'[^a-z0-9\s]', '-', text)

    text = re.sub(r'[ \t]+', '-', text)

    return text.strip()


def hashing_md5(message: str) -> str:
    return hashlib.md5(message.encode('utf-8')).hexdigest()
    
