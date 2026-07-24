import asyncio
import importlib
import sys
import time
import types
from unittest.mock import AsyncMock, MagicMock
from urllib.parse import quote

import aio_pika
import pytest
from testcontainers.rabbitmq import RabbitMqContainer

RABBITMQ_IMAGE = "rabbitmq:3.13-management-alpine"


def install_container_stub() -> MagicMock:
    existing = sys.modules.get("src.app.container")
    if existing is not None and hasattr(existing, "container"):
        return existing.container

    stub_container = MagicMock(name="container")
    stub_container.search_service = AsyncMock(name="search_service")
    stub_container.video = AsyncMock(name="video")
    stub_container.embedding = MagicMock(name="embedding")
    stub_container.qdrant = AsyncMock(name="qdrant")
    stub_container.postgres = AsyncMock(name="postgres")
    stub_container.redis_service = AsyncMock(name="redis_service")
    stub_container.grpc_client = AsyncMock(name="grpc_client")
    stub_container.s3_client = MagicMock(name="s3_client")
    stub_container.grpc_server = AsyncMock(name="grpc_server")

    stub_module = types.ModuleType("src.app.container")
    stub_module.container = stub_container
    stub_module.Container = MagicMock(name="Container")
    sys.modules["src.app.container"] = stub_module

    app_pkg = importlib.import_module("src.app")
    app_pkg.container = stub_module

    return stub_container


@pytest.fixture
def mock_container():
    stub_container = install_container_stub()
    stub_container.reset_mock(side_effect=False, return_value=False)
    stub_container.search_service = AsyncMock(name="search_service")
    stub_container.video = AsyncMock(name="video")
    yield stub_container


@pytest.fixture(scope="session")
def rabbitmq_container():
    with RabbitMqContainer(RABBITMQ_IMAGE) as container:
        yield container


@pytest.fixture
def rabbitmq_url(rabbitmq_container: RabbitMqContainer) -> str:
    host = rabbitmq_container.get_container_host_ip()
    port = rabbitmq_container.get_exposed_port(rabbitmq_container.port)
    vhost = rabbitmq_container.vhost
    vhost_path = "" if vhost in ("/", "") else quote(vhost, safe="")
    return (
        f"amqp://{rabbitmq_container.username}:{rabbitmq_container.password}"
        f"@{host}:{port}/{vhost_path}"
    )


async def wait_for_message(
    queue: aio_pika.abc.AbstractQueue, timeout: float = 5.0
) -> aio_pika.abc.AbstractIncomingMessage:
    """Poll a real queue until a message is available or `timeout` elapses."""
    deadline = time.monotonic() + timeout
    while True:
        message = await queue.get(fail=False)
        if message is not None:
            return message
        if time.monotonic() >= deadline:
            raise AssertionError(
                f"No message received from queue {queue.name!r} within {timeout}s"
            )
        await asyncio.sleep(0.1)
