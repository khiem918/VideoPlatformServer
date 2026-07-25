import asyncio
import logging
from src.core.config import config
from src.infrastructure.redis.redis import RedisService
from src.infrastructure.ml_model.embeding_model import EmbeddingService
from src.infrastructure.database.qdrant import QdrantService
from src.infrastructure.database.chunk_qdrant import ChunkQdrantService  # Bổ sung import để chạy giải thuật File 2
from src.infrastructure.grpc.grpc_client import GrpcClient
from src.domain.entity.search_respone import VideoMetadata
from src.infrastructure.s3.s3_client import S3Client
from src.domain.service.normalize import standard_normalize, normalize_query_to_id

logger = logging.getLogger(__name__)

class SearchService:
    def __init__(self, embedding_service, qdrant_service, chunk_qdrant_service, redis_service, grpc_service, s3_client):
        self.embedding_service : EmbeddingService = embedding_service
        self.qdrant_service : QdrantService = qdrant_service
        self.chunk_qdrant_service : ChunkQdrantService = chunk_qdrant_service  # Bổ sung dependency để chạy giải thuật File 2
        self.redis_service : RedisService = redis_service
        self.grpc_service : GrpcClient = grpc_service
        self._inflight_requests = {} 
        self._s3_client : S3Client = s3_client


    def _get_search_cache_key(self, user_id: str, query: str) -> str:
        query_id = normalize_query_to_id(query)
        return f"search:{user_id}:{query_id}"
    

    def _arrange_presign_url_result(self, result_metadata: list[dict], ordered_result_ids: list[str]) -> list[dict]:

        data_dict = {item["video_id"]: item for item in result_metadata}

        sorted_result = [
            {**data_dict[video_id], "thumbnail_url": self._s3_client.get_presigned_url(data_dict[video_id]["thumbnail_url"])}
            for video_id in ordered_result_ids
            if video_id in data_dict
        ]

        return sorted_result


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


    async def _await_cache_metadata(self, video_ids: list[str]):

        await asyncio.gather(*(self._inflight_requests[video_id].wait() for video_id in video_ids))
        return await self.redis_service.mget_with_ttl([f"meta:{id}" for id in video_ids])

    
    async def _cache_searching_result(self, user_id: str, query: str, ids: list[str]):
        
        redis_key = self._get_search_cache_key(user_id, query)
        await self.redis_service.zadd(redis_key, {id: index for index, id in enumerate(ids)}, expire= config.SEARCH_CACHE_TTL)
        
    
    async def _get_cached_searching_result(self, user_id: str, query: str, limit: int = 10, cursor: int | None = None): 
        
        redis_key = self._get_search_cache_key(user_id, query)
        end_index = cursor + limit - 1
        cached_ids = await self.redis_service.zrange(redis_key, cursor, end_index)

        if not cached_ids:
            return None, None  

        result_metadata = await self._handle_metadata(cached_ids)

        if not result_metadata: 
            return None, None

        return cached_ids, result_metadata


    async def _handle_metadata(self, video_ids: list[str]) -> list[VideoMetadata]: 
        
        next_caching_data = []
        missing_ids = []

        cached_data = await self.redis_service.mget_with_ttl([f"meta:{id}" for id in video_ids])

        result_metadata : list[VideoMetadata] = [item["value"] for item in cached_data if item["value"] is not None]

        for item in cached_data:

            if item["value"] is None: 
                missing_ids.append(item["key"].split(":")[1])

            if item ["value"] is not None and item["ttl"] < config.META_CACHE_TTL / 2:
                next_caching_data.append((item["key"], item["value"]))

        #-------------Inflight pattern-----------------------------------------------------     
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
                self._await_cache_metadata(on_request_ids) if on_request_ids else asyncio.sleep(0, result=[]),
            )

    
            if cached_response:
                result_metadata.extend([item["value"] for item in cached_response if item["value"] is not None])

        
            if grpc_response:
                for item in grpc_response:
                    result_metadata.append(item)

                    next_caching_data.append((f"meta:{item['video_id']}", item))

        if next_caching_data:
            asyncio.create_task(self.redis_service.mset(next_caching_data, expire=config.META_CACHE_TTL))

        return result_metadata        
               

    async def search(self, user_id : str, query: str, limit: int = 10, cursor: int | None = None) -> list[dict]:
        
        #-----------------Take searching result from redis cache if available---------------------------------

        if cursor is not None:

            ordered_ids, cached_results = await self._get_cached_searching_result(user_id, query, limit, cursor)
            
            if not cached_results:
                return [], None       

            return_result = self._arrange_presign_url_result(cached_results, ordered_ids)                 
                
            return return_result, cursor + limit 
        
        #---------------Handle searching algorithm (THAY THẾ BẰNG GIẢI THUẬT FILE 2)---------------------------

        normalized_query = standard_normalize(query)
        
        try:

            query_dense_vector = await self.embedding_service.embed_query(normalized_query)
        
        except Exception as e:

            logger.error(f"Error occurred while embedding query: {e}")
            raise Exception("Error occurred while embedding query") from e

        try:

            search_results = await self.qdrant_service.search_points(query_dense_vector, sparse_vector, config.MAX_SEARCH_RESULTS)
        
        except Exception as e:

            logger.error(f"Error occurred while searching chunks: {e}")
            raise Exception("Error occurred while searching chunks") from e
        
        ordered_chunks = sorted(chunk_results, key=lambda c: c.score, reverse=True)
        unique_video_ids = list({c.payload["videoId"] for c in ordered_chunks})

        result_metadata = await self._handle_metadata(ordered_result_ids)       

        # Ghép kết quả, lọc quyền riêng tư (visibility) theo đúng giải thuật của File 2.
        # result_metadata = []
        ordered_result_ids = []

        for chunk in ordered_chunks:
            video_id = chunk.payload["videoId"]
            owner_id = chunk.payload.get("userOwner")
            metadata = metadata_map.get(video_id)

            if metadata is None:
                continue

            # Lọc quyền riêng tư: chỉ hiển thị video PUBLIC hoặc video của chính chủ (safeguard mặc định PUBLIC nếu gRPC thiếu key visibility)
            is_owner = (owner_id == user_id) or (metadata.get("channel", {}).get("id") == user_id if isinstance(metadata.get("channel"), dict) else False)
            is_public = metadata.get("visibility", "PUBLIC") == "PUBLIC"

            if not (is_owner or is_public):
                continue

            if video_id not in ordered_result_ids:
                ordered_result_ids.append(video_id)
                # Ghép thêm các trường dữ liệu của Chunk AI (start, end, text, score) vào metadata để truyền xuống dưới
                # enriched_meta = {
                #     **metadata,
                #     "start": chunk.payload.get("start", 0),
                #     "end": chunk.payload.get("end", 0),
                #     "matched_text": chunk.payload.get("text", ""),
                #     "score": chunk.score,
                # }
                # result_metadata.append(enriched_meta)

        result_metadata = await self._handle_metadata(ordered_result_ids)

        #-----------------Cache searching result in redis (GIỮ NGUYÊN 100% CỦA FILE 1)------------------------

        presigned_results = self._arrange_presign_url_result(result_metadata, ordered_result_ids)

        if presigned_results:
            asyncio.create_task(self._cache_searching_result(user_id, query, [item["video_id"] for item in presigned_results]))

        return presigned_results, limit