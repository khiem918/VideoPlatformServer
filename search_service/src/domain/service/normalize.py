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

if __name__ == "__main__":
    sample_text = """
🔥 Our Hoodie is Now SOLD OUT 🔥 But you can still Get 10% OFF COOL SHIRTZ with code "COLDONES" 👉🏻 https://bit.ly/coolshirtzz
🥤 FOR 10% OFF YOUR GAMERSUPPS use code "COLDONES" 👉 https://bit.ly/coldonesGG
🅿️ Pledge to our patreon for extended videos: https://www.patreon.com/coldones

Watch The Video on @yeptheboys Channel 👉 https://www.youtube.com/watch?v=1oV0gsDoHJs

SEND STUFF TO OUR PO BOX AND IT MIGHT BE FEATURED IN A VID: ✉️📬
PO Box 5091
Glenferrie south
VIC 3122
Australia
__________________
"""

    normalized_text = normalize_desc(sample_text)
    print(normalized_text)