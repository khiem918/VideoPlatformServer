import json
from unittest.mock import AsyncMock

import aio_pika
import pytest

from tests.conftest import install_container_stub, wait_for_message

install_container_stub()

from src.app.worker import consumer as consumer_module  # noqa: E402
from src.app.worker.consumer import start_consumer  # noqa: E402
from src.infrastructure.queue import rabbitmq as rabbitmq_module  # noqa: E402
from src.infrastructure.queue.rabbitmq import EXCHANGE  # noqa: E402

RESPONSE_QUEUE = "video.metadata.response"


@pytest.fixture(autouse=True)
def fake_video_service(mocker):
    fake_video = AsyncMock()
    mocker.patch.object(consumer_module.container, "video", fake_video)
    return fake_video


@pytest.fixture(autouse=True)
def _configured_mq_url(rabbitmq_url, mocker):
    mocker.patch.object(rabbitmq_module, "MQ_URL", rabbitmq_url)


class TestStartConsumer:
    async def test_processes_metadata_with_parsed_payload_fields(
        self, fake_video_service, rabbitmq_url
    ):
        consumer_connection = await start_consumer()
        verify_connection = await aio_pika.connect_robust(rabbitmq_url)
        try:
            verify_channel = await verify_connection.channel()
            exchange = await verify_channel.get_exchange(EXCHANGE)
            response_queue = await verify_channel.get_queue(RESPONSE_QUEUE)
            await response_queue.purge()

            await exchange.publish(
                aio_pika.Message(
                    json.dumps(
                        {
                            "correlationId": "corr-1",
                            "videoId": "video-1",
                            "title": "A Title",
                            "desc": "A description",
                        }
                    ).encode("utf-8")
                ),
                routing_key="video.metadata.trans",
            )

            response_message = await wait_for_message(response_queue)
            async with response_message.process():
                pass

            fake_video_service.process_metadata.assert_awaited_once_with(
                "video-1", "A Title", "A description"
            )
        finally:
            await verify_connection.close()
            await consumer_connection.close()

    async def test_handles_missing_desc_field_gracefully(
        self, fake_video_service, rabbitmq_url
    ):
        consumer_connection = await start_consumer()
        verify_connection = await aio_pika.connect_robust(rabbitmq_url)
        try:
            verify_channel = await verify_connection.channel()
            exchange = await verify_channel.get_exchange(EXCHANGE)
            response_queue = await verify_channel.get_queue(RESPONSE_QUEUE)
            await response_queue.purge()

            await exchange.publish(
                aio_pika.Message(
                    json.dumps(
                        {
                            "correlationId": "corr-2",
                            "videoId": "video-1",
                            "title": "A Title",
                        }
                    ).encode("utf-8")
                ),
                routing_key="video.metadata.trans",
            )

            response_message = await wait_for_message(response_queue)
            async with response_message.process():
                pass

            fake_video_service.process_metadata.assert_awaited_once_with(
                "video-1", "A Title", None
            )
        finally:
            await verify_connection.close()
            await consumer_connection.close()

    async def test_publishes_encoded_response_after_processing(
        self, fake_video_service, rabbitmq_url
    ):
        """
        Regression test for the fix to the previous bug where the response
        body was passed to aio_pika.Message as a str instead of bytes,
        raising TypeError. Publishing a real message through the real broker
        exercises consumer.py's actual `.encode("utf-8")` call: if that fix
        regressed, `exchange.publish` inside the handler would raise and no
        response message would ever reach this queue.
        """
        consumer_connection = await start_consumer()
        verify_connection = await aio_pika.connect_robust(rabbitmq_url)
        try:
            verify_channel = await verify_connection.channel()
            exchange = await verify_channel.get_exchange(EXCHANGE)
            response_queue = await verify_channel.get_queue(RESPONSE_QUEUE)
            await response_queue.purge()

            await exchange.publish(
                aio_pika.Message(
                    json.dumps(
                        {
                            "correlationId": "corr-42",
                            "videoId": "video-1",
                            "title": "A Title",
                            "desc": None,
                        }
                    ).encode("utf-8")
                ),
                routing_key="video.metadata.trans",
            )

            response_message = await wait_for_message(response_queue)
            async with response_message.process():
                assert isinstance(response_message.body, bytes)
                assert json.loads(response_message.body.decode()) == {
                    "correlationId": "corr-42",
                    "status": "succeeded",
                }
        finally:
            await verify_connection.close()
            await consumer_connection.close()
