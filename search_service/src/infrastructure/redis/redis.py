import json
import os
import logging
from redis.asyncio import Redis
from typing import Optional, Any

class RedisService:
    def __init__(self):
        self._client: Redis = Redis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:5438"),
            decode_responses=True,
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