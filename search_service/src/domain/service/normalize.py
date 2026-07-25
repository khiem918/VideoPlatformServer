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

# Bí danh tương thích ngược cho các module cũ thuộc nhánh feat
normalize_title = standard_normalize


def normalize_query_to_id(text: str) -> str:
    if not text:
        return ""

    text = emoji.replace_emoji(text, replace='-')
    text = text.lower()
    text = unidecode.unidecode(text)
    text = re.sub(r'[^a-z0-9\s]', '-', text)
    text = re.sub(r'[ \t]+', '-', text)

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


def normalize_transcript_text(text: str) -> str:
    """
    Chuẩn hóa text cho pipeline transcript (video_chunks) — GIỮ dấu tiếng Việt,
    khác với normalize_search_query() vốn dùng unidecode (mất dấu, chỉ phù hợp
    cho collection 'videos' title/desc).

    Lý do giữ dấu: multilingual-e5 được train trên tiếng Việt có dấu, bỏ dấu
    làm giảm chất lượng semantic search. Dùng hàm này ở CẢ 2 đầu (lúc embed
    chunk khi index và lúc embed câu query khi search) để đảm bảo đối xứng.
    """
    if not text:
        return ""

    text = emoji.replace_emoji(text, replace=' ')
    text = text.lower()
    text = re.sub(r'[^\w\s]', ' ', text, flags=re.UNICODE)
    text = re.sub(r'[ \t]+', ' ', text)

    return text.strip()


def hashing_md5(message: str) -> str:
    return hashlib.md5(message.encode('utf-8')).hexdigest()
