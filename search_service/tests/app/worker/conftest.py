import json
from unittest.mock import AsyncMock, MagicMock


class FakeProcessContext:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


def make_incoming_message(payload: dict) -> MagicMock:
    message = MagicMock()
    message.body = json.dumps(payload).encode()
    message.process = MagicMock(return_value=FakeProcessContext())
    return message


def make_exchange() -> AsyncMock:
    exchange = AsyncMock()
    return exchange
