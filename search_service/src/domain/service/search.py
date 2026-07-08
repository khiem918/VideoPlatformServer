import os
import asyncio
from src.infrastructure.redis.redis import RedisService
from src.infrastructure.ml_model.embeding_model import EmbeddingService
from src.infrastructure.database.qdrant import QdrantService
from src.infrastructure.grpc.grpc_client import GrpcClient
from src.domain.entity.search_respone import VideoMetadata
from src.infrastructure.s3.s3_client import S3Client
from src.domain.service.normalize import normalize_search_query

class SearchService:
    def __init__(self, embedding_service, qdrant_service, redis_service, grpc_service, s3_client):
        self.embedding_service : EmbeddingService = embedding_service
        self.qdrant_service : QdrantService = qdrant_service
        self.redis_service : RedisService = redis_service
        self.grpc_service : GrpcClient = grpc_service
        self._meta_cache_ttl  = int(os.getenv("META_CACHE_TTL", 3600))
        self._inflight_requests = {} 
        self._s3_client : S3Client = s3_client


    async def get_metadata_grpc(self, video_ids: list[str]) -> list[VideoMetadata]:

        try:
            grpc_response = await self.grpc_service.get_video_metadata(video_ids)

            if grpc_response is None:
                return []

            return [{
                    "video_id": item.video_id,
                    "title": item.title,            
                    "description": item.description,
                    "thumbnail_url": item.thumbnail_url,
                    "view": item.view,
                    "date": item.date,
                    "channel": item.channel,
                } for item in grpc_response]
        
        finally:
            for video_id in video_ids:
                
                if video_id in self._inflight_requests:

                    self._inflight_requests[video_id].set()
                    self._inflight_requests.pop(video_id, None)


    async def await_cache_metadata(self, video_ids: list[str]):

        await asyncio.gather(*(self._inflight_requests[video_id].wait() for video_id in video_ids))

        return await self.redis_service.mget_with_ttl([f"meta:{id}" for id in video_ids])



    """
        searching process: query -> embedding -> search in qdrant 
                        -> list[video_id] sorted by descending score -> get video metadata from redis 
                        -> if not hit, get video metadata by gRPC -> cache in redis -> return video metadata list
    

        Metadata caching structure: 
                        - key: meta:id 
                        - value: { 
                                    video_id,
                                    title, 
                                    description, 
                                    thumbnail_url, 
                                    view, 
                                    date, 
                                    channel 
                                }
    
    """    
    async def search(self, query: str, userId: str) -> list[VideoMetadata]:
        
        #---------------Handle searching algorithm---------------------------------------------

        normalized_query = normalize_search_query(query)

        query_dense_vector = await self.embedding_service.embed_query(normalized_query)
        sparse_vector = await self.embedding_service.embed_sparse(normalized_query)

        search_results = await self.qdrant_service.search_points(query_dense_vector, sparse_vector, userId)

        result_ids = [result.id for result in search_results]

        ordered_result_ids = [result.id for result in sorted(search_results, key=lambda x: x.score, reverse=True)]

        #------------------Handle response------------------------------------------------
        
        next_caching_data = []
        missing_ids = []

        cached_data = await self.redis_service.mget_with_ttl([f"meta:{id}" for id in result_ids])

        result_metadata : list[VideoMetadata] = [item["value"] for item in cached_data if item["value"] is not None]

        for item in cached_data:

            if item["value"] is None: 
                missing_ids.append(item["key"].split(":")[1])

            if item ["value"] is not None and item["ttl"] < self._meta_cache_ttl / 2:
                next_caching_data.append((item["key"], item["value"]))
            
        if missing_ids:
            
            not_on_request_ids = []
            on_request_ids = []

            for video_id in missing_ids:
                if video_id in self._inflight_requests:
                    on_request_ids.append(video_id)
                else:
                    not_on_request_ids.append(video_id)
                    self._inflight_requests[video_id] = asyncio.Event()

            grpc_response, cached_response = await asyncio.gather(
                self.get_metadata_grpc(not_on_request_ids) if not_on_request_ids else asyncio.sleep(0, result=[]),
                self.await_cache_metadata(on_request_ids) if on_request_ids else asyncio.sleep(0, result=[]),
            )

        
            if cached_response:
                result_metadata.extend([item["value"] for item in cached_response if item["value"] is not None])

        
            if grpc_response:
                for item in grpc_response:
                    result_metadata.append(item)

                    next_caching_data.append((f"meta:{item['video_id']}", item))

        
        if next_caching_data:
            asyncio.create_task(self.redis_service.mset(next_caching_data, expire=self._meta_cache_ttl))

        
        data_dict = {item["video_id"]: item for item in result_metadata}
        sorted_result = [data_dict[video_id] for video_id in ordered_result_ids if video_id in data_dict]
        presigned_results = [{
            **item,
            "thumbnail_url": self._s3_client.get_presigned_url(item["thumbnail_url"])
        } for item in sorted_result]

        
        return presigned_results
