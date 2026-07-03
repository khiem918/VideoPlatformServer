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
            - cache video's metadata: metadata:videoid
    
    """
    async def set(self, key: str, value: Any, expire: int = 3600):
        await self._client.set(key, json.dumps(value), ex=expire)


    async def get(self, key: str) -> Optional[Any]:
        result = await self._client.get(key)
        return json.loads(result) if result else None


    async def delete(self, key: str):
        await self._client.delete(key)


    async def mget(self, keys: list[str]) -> list[Optional[Any]]:
        results = await self._client.mget(keys)
        return [json.loads(result) if result else None for result in results]


    async def set_keys_value(self, keys: list[str], value: Any, expire: int = 3600): 
        pipeline = self._client.pipeline()

        map(lambda x : pipeline.set(x, json.dumps(value), expire), keys)

        await pipeline.execute()