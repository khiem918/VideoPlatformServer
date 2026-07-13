from unittest.mock import AsyncMock, MagicMock

import pytest

from src.infrastructure.database import postgres as postgres_module
from src.infrastructure.database.postgres import PostgresService


@pytest.fixture
def prisma_cls(mocker):
    return mocker.patch.object(postgres_module, "Prisma", MagicMock())


class TestConnect:
    async def test_creates_prisma_client_with_configured_datasource_url(
        self, mocker, prisma_cls
    ):
        mocker.patch.object(
            postgres_module.config, "DATABASE_URL", "postgresql://fake:fake@localhost/fake"
        )
        fake_client = MagicMock()
        fake_client.connect = AsyncMock()
        prisma_cls.return_value = fake_client

        service = PostgresService()
        await service.connect()

        prisma_cls.assert_called_with(
            datasource={"url": "postgresql://fake:fake@localhost/fake"}
        )
        fake_client.connect.assert_awaited_once()

    async def test_client_property_reflects_connected_client(
        self, mocker, prisma_cls
    ):
        fake_client = MagicMock()
        fake_client.connect = AsyncMock()
        prisma_cls.return_value = fake_client

        service = PostgresService()
        await service.connect()

        assert service.client is fake_client


class TestDisconnect:
    async def test_disconnects_the_client(self, prisma_cls):
        fake_client = MagicMock()
        fake_client.disconnect = AsyncMock()
        prisma_cls.return_value = fake_client

        service = PostgresService()
        service._client = fake_client
        await service.disconnect()

        fake_client.disconnect.assert_awaited_once()
