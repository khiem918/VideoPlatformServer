import os
import asyncio
from src.infrastructure.redis.redis import RedisService
from src.infrastructure.ml_model.embeding_model import EmbeddingService
from src.infrastructure.database.chunk_qdrant import ChunkQdrantService
from src.infrastructure.grpc.grpc_client import GrpcClient
from src.domain.entity.search_respone import VideoMetadata
from src.infrastructure.s3.s3_client import S3Client
from src.domain.service.normalize import normalize_search_query
import logging
logger = logging.getLogger(__name__)

class SearchService:
    def __init__(self, embedding_service, chunk_qdrant_service, redis_service, grpc_service, s3_client):
        self.embedding_service : EmbeddingService = embedding_service
        self.chunk_qdrant_service : ChunkQdrantService = chunk_qdrant_service
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
                    "visibility": item.visibility,
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
        searching process: query -> embedding -> search chunk trong qdrant (video_chunks)
                        -> list[chunk] sorted by descending score -> lấy video_id duy nhất
                        -> get video metadata (cache/gRPC) -> filter theo visibility
                        -> ghép chunk + metadata -> trả về list đoạn nội dung khớp
    """    
    async def search(self, query: str, userId: str, limit: int = 20) -> list[dict]:

        #---------------Handle searching algorithm---------------------------------------------

        normalized_query = normalize_search_query(query)

        query_dense_vector = await self.embedding_service.embed_query(normalized_query)

        chunk_results = await self.chunk_qdrant_service.search_chunks(
            query_vector=query_dense_vector,
            limit=limit,
        )

        # Sắp xếp chunk theo score giảm dần, giữ nguyên object chunk (cần payload)
        ordered_chunks = sorted(chunk_results, key=lambda c: c.score, reverse=True)

        # video_id duy nhất cần lấy metadata (1 video có thể có nhiều chunk khớp)
        unique_video_ids = list({c.payload["videoId"] for c in ordered_chunks})

        #------------------Handle response------------------------------------------------

        next_caching_data = []
        missing_ids = []

        cached_data = await self.redis_service.mget_with_ttl([f"meta:{id}" for id in unique_video_ids])

        metadata_map: dict[str, VideoMetadata] = {
            item["key"].split(":")[1]: item["value"]
            for item in cached_data if item["value"] is not None
        }

        for item in cached_data:
            if item["value"] is None:
                missing_ids.append(item["key"].split(":")[1])
            if item["value"] is not None and item["ttl"] < self._meta_cache_ttl / 2:
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
                for item in cached_response:
                    if item["value"] is not None:
                        metadata_map[item["key"].split(":")[1]] = item["value"]

            if grpc_response:
                for item in grpc_response:
                    metadata_map[item["video_id"]] = item
                    next_caching_data.append((f"meta:{item['video_id']}", item))

        if next_caching_data:
            asyncio.create_task(self.redis_service.mset(next_caching_data, expire=self._meta_cache_ttl))

        #------------------Filter visibility + ghép kết quả------------------------------------

        results = []

        for chunk in ordered_chunks:
            video_id = chunk.payload["videoId"]
            owner_id = chunk.payload.get("userOwner")
            metadata = metadata_map.get(video_id)

            if metadata is None:
                # Video có chunk trong Qdrant nhưng không lấy được metadata (đã xoá / lỗi gRPC)
                continue

            is_owner = owner_id == userId
            is_public = metadata.get("visibility") == "PUBLIC"

            if not (is_owner or is_public):
                continue
            
            try:
                thumbnail_url = self._s3_client.get_presigned_url(metadata["thumbnail_url"])
            except Exception as e:
                logger.warning(f"Không tạo được presigned URL cho video {video_id}: {e}")
                thumbnail_url = ""
            
            results.append({
                "video_id": video_id,
                "title": metadata["title"],
                "description": metadata.get("description") or "",
                "view": metadata["view"],
                "date": metadata["date"],
                "channel": metadata["channel"],
                "start": chunk.payload["start"],
                "end": chunk.payload["end"],
                "matched_text": chunk.payload["text"],
                "score": chunk.score,
                "thumbnail_url": thumbnail_url,
            })

        return results