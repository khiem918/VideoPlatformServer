from unittest.mock import AsyncMock, MagicMock

import aio_pika
import pytest

from src.infrastructure.queue import rabbitmq as rabbitmq_module
from src.infrastructure.queue.rabbitmq import declare, get_mq_connection


class TestGetMqConnection:
    async def test_connects_using_configured_mq_url(self, mocker):
        fake_connection = AsyncMock()
        connect_robust = mocker.patch.object(
            rabbitmq_module.aio_pika, "connect_robust", AsyncMock(return_value=fake_connection)
        )

        result = await get_mq_connection()

        connect_robust.assert_awaited_once_with(rabbitmq_module.MQ_URL)
        assert result is fake_connection


class TestDeclare:
    async def test_declares_exchanges_and_queues_with_expected_bindings(self):
        exchange = AsyncMock()
        dlx_exchange = AsyncMock()
        transfer_queue = AsyncMock()
        response_queue = AsyncMock()
        dead_letter_queue = AsyncMock()

        channel = AsyncMock()
        channel.declare_exchange.side_effect = [exchange, dlx_exchange]
        channel.declare_queue.side_effect = [
            transfer_queue,
            response_queue,
            dead_letter_queue,
        ]

        (
            returned_exchange,
            returned_dlx_exchange,
            returned_transfer_queue,
            returned_dead_letter_queue,
        ) = await declare(channel)

        assert returned_exchange is exchange
        assert returned_dlx_exchange is dlx_exchange
        assert returned_transfer_queue is transfer_queue
        assert returned_dead_letter_queue is dead_letter_queue

        transfer_queue.bind.assert_awaited_once_with(
            exchange, routing_key="video.metadata.trans"
        )
<<<<<<< HEAD
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
=======
        response_queue.bind.assert_awaited_once_with(
            exchange, routing_key="video.metadata.res"
>>>>>>> parent of 2247c5d (Merge pull request #5 from khiem918/feat/aws-integration)
        )
        dead_letter_queue.bind.assert_awaited_once_with(dlx_exchange, routing_key="#")

    async def test_declares_transfer_queue_with_dead_letter_arguments(self):
        channel = AsyncMock()
        channel.declare_exchange.side_effect = [AsyncMock(), AsyncMock()]
        channel.declare_queue.side_effect = [AsyncMock(), AsyncMock(), AsyncMock()]

        await declare(channel)

<<<<<<< HEAD
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
=======
        first_queue_call = channel.declare_queue.await_args_list[0]
        assert first_queue_call.args[0] == "video.metadata.transfer"
        assert first_queue_call.kwargs["arguments"] == {
            "x-dead-letter-exchange": "video.processing.dlx",
            "x-dead-letter-routing-key": "video.metadata.trans",
        }
>>>>>>> parent of 2247c5d (Merge pull request #5 from khiem918/feat/aws-integration)
