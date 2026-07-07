import logging
import os

from prisma import Prisma

logger = logging.getLogger(__name__)


class PostgresService:
    def __init__(self):
        self._client = Prisma()

    async def connect(self) -> None:
        database_url = os.getenv("DATABASE_URL") or ""
        if not database_url:
            raise RuntimeError("DATABASE_URL is not set")

        self._client = Prisma(datasource={"url": database_url})
        await self._client.connect()
        logger.info("Connected to PostgreSQL")

    async def disconnect(self) -> None:
        await self._client.disconnect()
        logger.info("Disconnected from PostgreSQL")

    @property
    def client(self) -> Prisma:
        return self._client
