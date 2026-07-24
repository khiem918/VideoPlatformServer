import json

import aio_pika
import pytest

from tests.conftest import wait_for_message

from src.infrastructure.queue import rabbitmq as rabbitmq_module
from src.infrastructure.queue.rabbitmq import declare, get_mq_connection


@pytest.fixture(autouse=True)
def _configured_mq_url(rabbitmq_url, mocker):
    """Point the module's MQ_URL at the real test broker (config, not the connection)."""
    mocker.patch.object(rabbitmq_module, "MQ_URL", rabbitmq_url)


class TestGetMqConnection:
    async def test_connects_using_configured_mq_url(self):
        connection = await get_mq_connection()

        try:
            assert isinstance(connection, aio_pika.RobustConnection)
            assert not connection.is_closed
        finally:
            await connection.close()


class TestDeclare:
    async def test_declares_exchanges_and_queues_with_expected_bindings(self):
        connection = await get_mq_connection()
        channel = await connection.channel()

        exchange, dlx_exchange, transfer_queue, dead_letter_queue = await declare(
            channel
        )
        response_queue = await channel.get_queue("video.metadata.response")

        await transfer_queue.purge()
        await dead_letter_queue.purge()
        await response_queue.purge()
        
        await exchange.publish(
            aio_pika.Message(json.dumps({"which": "transfer"}).encode()),
            routing_key="video.metadata.trans",
        )
        await exchange.publish(
            aio_pika.Message(json.dumps({"which": "response"}).encode()),
            routing_key="video.metadata.res",
        )
        await dlx_exchange.publish(
            aio_pika.Message(json.dumps({"which": "dead-letter"}).encode()),
            routing_key="anything",
        )

        transfer_message = await wait_for_message(transfer_queue)
        async with transfer_message.process():
            assert json.loads(transfer_message.body.decode()) == {
                "which": "transfer"
            }

        response_message = await wait_for_message(response_queue)
        async with response_message.process():
            assert json.loads(response_message.body.decode()) == {
                "which": "response"
            }

        dead_letter_message = await wait_for_message(dead_letter_queue)
        async with dead_letter_message.process():
            assert json.loads(dead_letter_message.body.decode()) == {
                "which": "dead-letter"
            }

        await connection.close()

    async def test_rejected_transfer_message_is_dead_lettered(self):
        connection = await get_mq_connection()
        channel = await connection.channel()

        exchange, _, transfer_queue, dead_letter_queue = await declare(channel)
        
        await transfer_queue.purge()
        await dead_letter_queue.purge()

        await exchange.publish(
            aio_pika.Message(json.dumps({"correlationId": "corr-1"}).encode()),
            routing_key="video.metadata.trans",
        )

        transfer_message = await wait_for_message(transfer_queue)
        await transfer_message.reject(requeue=False)

        dead_lettered = await wait_for_message(dead_letter_queue)
        async with dead_lettered.process():
            assert json.loads(dead_lettered.body.decode()) == {
                "correlationId": "corr-1"
            }

        await connection.close()
