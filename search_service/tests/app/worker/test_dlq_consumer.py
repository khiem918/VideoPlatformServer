import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from tests.app.worker.conftest import make_exchange, make_incoming_message

from src.app.worker import dlq_consumer as dlq_consumer_module
from src.app.worker.dlq_consumer import handle_dead_letter_message


@pytest.fixture(autouse=True)
def fake_sleep(mocker):
    return mocker.patch.object(dlq_consumer_module.asyncio, "sleep", AsyncMock())


def make_message_with_headers(payload, headers=None):
    message = make_incoming_message(payload)
    message.headers = headers or {}
    return message


class TestHandleDeadLetterMessageRequeue:
    async def test_republishes_original_body_when_under_max_retries(self, fake_sleep):
        message = make_message_with_headers(
            {"correlationId": "corr-1", "videoId": "video-1"},
            headers={"x-death": [{"count": 1}]},
        )
        exchange = make_exchange()

        await handle_dead_letter_message(message, exchange)

        exchange.publish.assert_awaited_once()
        published_message = exchange.publish.await_args.args[0]
        assert published_message.body == message.body
        assert exchange.publish.await_args.kwargs["routing_key"] == "video.metadata.trans"

    async def test_treats_missing_x_death_header_as_zero_death_count(self, fake_sleep):
        message = make_message_with_headers(
            {"correlationId": "corr-1", "videoId": "video-1"}, headers={}
        )
        exchange = make_exchange()

        await handle_dead_letter_message(message, exchange)

        fake_sleep.assert_awaited_once_with(1)

    async def test_uses_exponential_backoff_below_max_retries(self, fake_sleep):
        message = make_message_with_headers(
            {"correlationId": "corr-1", "videoId": "video-1"},
            headers={"x-death": [{"count": 2}]},
        )
        exchange = make_exchange()

        await handle_dead_letter_message(message, exchange)

        fake_sleep.assert_awaited_once_with(4)
    
class TestHandleDeadLetterMessageMaxRetriesExceeded:
    async def test_does_not_requeue_and_publishes_to_dlq_when_max_retries_reached(
        self, fake_sleep
    ):
        message = make_message_with_headers(
            {"correlationId": "corr-1", "videoId": "video-1"},
            headers={"x-death": [{"count": 3}]},
        )
        exchange = make_exchange()
        exchange.publish = AsyncMock()

        await handle_dead_letter_message(message, exchange)

        fake_sleep.assert_not_awaited()
        assert exchange.publish.await_count == 1
        published_msg = exchange.publish.call_args[0][0]
        assert isinstance(published_msg.body, bytes)