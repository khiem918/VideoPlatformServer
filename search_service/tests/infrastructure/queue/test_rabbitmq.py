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
        response_queue.bind.assert_awaited_once_with(
            exchange, routing_key="video.metadata.res"
        )
        dead_letter_queue.bind.assert_awaited_once_with(dlx_exchange, routing_key="#")

    async def test_declares_transfer_queue_with_dead_letter_arguments(self):
        channel = AsyncMock()
        channel.declare_exchange.side_effect = [AsyncMock(), AsyncMock()]
        channel.declare_queue.side_effect = [AsyncMock(), AsyncMock(), AsyncMock()]

        await declare(channel)

        first_queue_call = channel.declare_queue.await_args_list[0]
        assert first_queue_call.args[0] == "video.metadata.transfer"
        assert first_queue_call.kwargs["arguments"] == {
            "x-dead-letter-exchange": "video.processing.dlx",
            "x-dead-letter-routing-key": "video.metadata.trans",
        }
