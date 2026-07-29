import json
import logging
from redis.asyncio import Redis
from typing import Optional, Any
from src.core.config import config

# An ElastiCache node created with in-transit encryption accepts TLS only, and
# it stalls a plaintext client rather than rejecting it: the TCP handshake
# succeeds, then the server waits for a ClientHello while the client waits for
# a reply, and neither side ever times out. Without these bounds that turns
# into a permanent hang inside the FastAPI lifespan, so uvicorn never starts
# serving and every health check fails with nothing in the logs to explain it.
# Use a rediss:// REDIS_URL against such a node; redis-py enables TLS from the
# scheme. None of this client's commands block by design, so bounding every
# read is safe here (the BullMQ worker connection is a separate client).
REDIS_CONNECT_TIMEOUT_SECONDS = 10
REDIS_COMMAND_TIMEOUT_SECONDS = 10


class RedisService:
    def __init__(self):
        self._client: Redis = Redis.from_url(
            config.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=REDIS_CONNECT_TIMEOUT_SECONDS,
            socket_timeout=REDIS_COMMAND_TIMEOUT_SECONDS,
        )

    async def connect(self):
        await self._client.ping()
        logging.info("Connected to Redis successfully")
    
    async def disconnect(self):
        await self._client.close()
        logging.info("Redis connection closed successfully")

    """
    
        define key name: 
            - cache video's metadata: meta:id
    
    """
    async def set(self, key: str, value: Any, expire: int = 3600):
        await self._client.set(key, json.dumps(value), ex=expire)


    async def get(self, key: str) -> Optional[Any]:
        result = await self._client.get(key)
        return json.loads(result) if result else None


    async def delete(self, key: str):
        await self._client.delete(key)


    async def mget_with_ttl(self, keys: list[str]) -> list[dict[str, Any]]:
        pipeline = self._client.pipeline()
        pipeline.mget(keys) 

        for key in keys:
            pipeline.ttl(key)

        results = await pipeline.execute()
        values = results[0]
        ttls = results[1:]

        return [
            {
                "key": key,
                "value": json.loads(value) if value else None,
                "ttl": ttl,
            }
            for key, value, ttl in zip(keys, values, ttls)
        ]


    async def mset(self, key_value_pairs: list[tuple[str, dict]], expire: int = 3600):     
        pipeline = self._client.pipeline()

        for key, value in key_value_pairs:
            pipeline.set(key, json.dumps(value), ex=expire)

        await pipeline.execute()


    async def mupdate(self, key_value_pairs: list[tuple[str, dict]], expire: int = 3600):
        pipeline = self._client.pipeline()

        for key, value in key_value_pairs:
            pipeline.set(key, json.dumps(value), ex=expire)

        await pipeline.execute()


    async def zadd(self, key: str, value: dict, expire: int = 3600):
     
        pipeline = self._client.pipeline()
     
        pipeline.zadd(key, value)
        pipeline.expire(key, expire)
     
        await pipeline.execute()


    async def zrange(self, key: str, start: int, end: int) -> list[str] | None:

        result = await self._client.zrange(key, start, end)
        return result if result else None

    async def delete_by_pattern(self, patterns: list[str]): 
        
        pipeline = self._client.pipeline()
        
        delete_key_count = 0

        for pattern in patterns:
            for key in self._client.scan_iter(match=pattern, count=1000):
                pipeline.delete(key)
                delete_key_count += 1

                if delete_key_count % 1000 == 0:
                    pipeline.execute()

        if delete_key_count % 1000 != 0: 
            pipeline.execute()
        
