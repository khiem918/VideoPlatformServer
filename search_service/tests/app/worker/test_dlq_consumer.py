import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import aio_pika
import pytest

from tests.conftest import wait_for_message

from src.app.worker import dlq_consumer as dlq_consumer_module
from src.app.worker.dlq_consumer import handle_dead_letter_message
from src.infrastructure.queue import rabbitmq as rabbitmq_module
from src.infrastructure.queue.rabbitmq import declare, get_mq_connection

RETRY_ROUTING_KEY = "video.metadata.trans"
TRANSFER_QUEUE = "video.metadata.transfer"


@pytest.fixture(autouse=True)
def _configured_mq_url(rabbitmq_url, mocker):
    mocker.patch.object(rabbitmq_module, "MQ_URL", rabbitmq_url)


@pytest.fixture(autouse=True)
def fake_sleep(mocker):
    # Rebind only the `asyncio` name inside dlq_consumer's module namespace,
    # not the real process-global asyncio module: with a real broker
    # connection, aio_pika/aiormq rely on genuine asyncio.sleep internally
    # (heartbeats, retries), so patching the global attribute deadlocks them.
    fake_async_sleep = AsyncMock()
    mocker.patch.object(
        dlq_consumer_module, "asyncio", SimpleNamespace(sleep=fake_async_sleep)
    )
    return fake_async_sleep


@pytest.fixture
async def broker(rabbitmq_url):
    connection = await get_mq_connection()
    channel = await connection.channel()
    main_exchange, dlx_exchange, transfer_queue, dead_letter_queue = await declare(
        channel
    )
    await transfer_queue.purge()
    await dead_letter_queue.purge()
    try:
        yield SimpleNamespace(
            channel=channel,
            main_exchange=main_exchange,
            dlx_exchange=dlx_exchange,
            transfer_queue=transfer_queue,
            dead_letter_queue=dead_letter_queue,
        )
    finally:
        await connection.close()


async def _publish_never_dead_lettered(broker, payload):
    """Publish straight onto the DLX so no broker dead-letter event has
    ever happened -- the message genuinely carries no x-death header."""
    await broker.dlx_exchange.publish(
        aio_pika.Message(json.dumps(payload).encode("utf-8")),
        routing_key=RETRY_ROUTING_KEY,
    )


async def _publish_with_real_death_count(broker, payload, death_count):
    """
    Drive `payload` through `death_count` genuine reject/DLX cycles via the
    real transfer queue. RabbitMQ resets any client-supplied x-death header
    on an ordinary publish (verified empirically), so a real count can only
    come from the broker's own dead-lettering. Leaves the final
    dead-lettered message unconsumed in `dead_letter_queue` for the caller
    to pull via `wait_for_message`.
    """
    body = json.dumps(payload).encode("utf-8")
    headers = None

    for cycle in range(death_count):
        await broker.main_exchange.publish(
            aio_pika.Message(body, headers=headers), routing_key=RETRY_ROUTING_KEY
        )
        transfer_message = await wait_for_message(broker.transfer_queue)
        await transfer_message.reject(requeue=False)

        if cycle < death_count - 1:
            # An unacked basic.get result is invisible to further `.get()`
            # calls until requeued, so only pull it back off the queue when
            # another cycle needs its body/headers to republish. On the
            # final cycle, leave it sitting there for the caller to pull.
            dead_lettered = await wait_for_message(broker.dead_letter_queue)
            body = dead_lettered.body
            headers = dead_lettered.headers
            async with dead_lettered.process():
                pass


class TestHandleDeadLetterMessageRequeue:
    async def test_republishes_original_body_when_under_max_retries(
        self, broker, fake_sleep
    ):
        await _publish_with_real_death_count(
            broker, {"correlationId": "corr-1", "videoId": "video-1"}, death_count=1
        )
        message = await wait_for_message(broker.dead_letter_queue)

        await handle_dead_letter_message(message, broker.dlx_exchange)

        republished = await wait_for_message(broker.dead_letter_queue)
        async with republished.process():
            assert json.loads(republished.body.decode()) == {
                "correlationId": "corr-1",
                "videoId": "video-1",
            }

    async def test_treats_missing_x_death_header_as_zero_death_count(
        self, broker, fake_sleep
    ):
        await _publish_never_dead_lettered(
            broker, {"correlationId": "corr-1", "videoId": "video-1"}
        )
        message = await wait_for_message(broker.dead_letter_queue)

        await handle_dead_letter_message(message, broker.dlx_exchange)

        fake_sleep.assert_awaited_once_with(1)

        republished = await wait_for_message(broker.dead_letter_queue)
        async with republished.process():
            pass

    async def test_uses_exponential_backoff_below_max_retries(self, broker, fake_sleep):
        await _publish_with_real_death_count(
            broker, {"correlationId": "corr-1", "videoId": "video-1"}, death_count=2
        )
        message = await wait_for_message(broker.dead_letter_queue)

        await handle_dead_letter_message(message, broker.dlx_exchange)

        fake_sleep.assert_awaited_once_with(4)

        republished = await wait_for_message(broker.dead_letter_queue)
        async with republished.process():
            pass


class TestHandleDeadLetterMessageMaxRetriesExceeded:
    async def test_bug_publish_failure_message_raises_type_error_for_unencoded_body(
        self, broker, fake_sleep
    ):
        """
        Regression test documenting a real, currently-unfixed bug: the
        max-retries branch in dlq_consumer.py builds `aio_pika.Message(body=
        json.dumps(...))` without `.encode()`, so `aio_pika.Message.__init__`
        (which does `bytes(body)` for non-bytes input) raises TypeError.
        """
        await _publish_with_real_death_count(
            broker, {"correlationId": "corr-1", "videoId": "video-1"}, death_count=3
        )
        message = await wait_for_message(broker.dead_letter_queue)

        with pytest.raises(TypeError, match="string argument without an encoding"):
            await handle_dead_letter_message(message, broker.dlx_exchange)

        fake_sleep.assert_not_awaited()

    async def test_does_not_requeue_when_max_retries_reached(self, broker, fake_sleep):
        await _publish_with_real_death_count(
            broker, {"correlationId": "corr-1", "videoId": "video-1"}, death_count=3
        )
        message = await wait_for_message(broker.dead_letter_queue)

        with pytest.raises(TypeError):
            await handle_dead_letter_message(message, broker.dlx_exchange)

        fake_sleep.assert_not_awaited()
