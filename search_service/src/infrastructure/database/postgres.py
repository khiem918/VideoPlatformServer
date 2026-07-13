import logging

from prisma import Prisma

from src.core.config import config

logger = logging.getLogger(__name__)


class PostgresService:
    def __init__(self):
        self._client = Prisma()

    async def connect(self) -> None:
        self._client = Prisma(datasource={"url": config.DATABASE_URL})
        await self._client.connect()
        logger.info("Connected to PostgreSQL")

    async def disconnect(self) -> None:
        await self._client.disconnect()
        logger.info("Disconnected from PostgreSQL")

    @property
    def client(self) -> Prisma:
        return self._client
