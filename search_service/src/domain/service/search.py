import os
import json
import asyncio
import logging
from src.core.config import config
from src.infrastructure.redis.redis import RedisService
from src.infrastructure.ml_model.embeding_model import EmbeddingService
from src.infrastructure.database.qdrant import QdrantService
from src.infrastructure.database.chunk_qdrant import ChunkQdrantService
from src.infrastructure.grpc.grpc_client import GrpcClient
from src.domain.entity.search_respone import VideoMetadata
from src.infrastructure.s3.s3_client import S3Client
from src.domain.service.normalize import standard_normalize, normalize_query_to_id

logger = logging.getLogger(__name__)


class SearchService:
    def __init__(
        self,
        embedding_service: EmbeddingService,
        qdrant_service: QdrantService,
        chunk_qdrant_service: ChunkQdrantService,
        redis_service: RedisService,
        grpc_service: GrpcClient,
        s3_client: S3Client,
    ):
        self.embedding_service = embedding_service
        self.qdrant_service = qdrant_service
        self.chunk_qdrant_service = chunk_qdrant_service
        self.redis_service = redis_service
        self.grpc_service = grpc_service
        self._s3_client = s3_client
        self._inflight_requests = {}
        self._meta_cache_ttl = getattr(config, "META_CACHE_TTL", 3600)
        self._search_cache_ttl = getattr(config, "SEARCH_CACHE_TTL", 300)

    def _get_search_cache_key(self, user_id: str, query: str) -> str:
        query_id = normalize_query_to_id(query)
        return f"search:{user_id}:{query_id}"

    # ==================== PHẦN CACHE KẾT QUẢ TÌM KIẾM NÂNG CẤP ====================

    async def _cache_searching_result(self, redis_key: str, results: list[dict]):
        """
        Lưu toàn bộ danh sách kết quả chunk (kèm start, end, matched_text) vào Redis dạng JSON
        để hỗ trợ phân trang mượt mà cho Multimodal AI mà không cần truy vấn lại Qdrant.
        """
        try:
            serialized_data = json.dumps(results)
            await self.redis_service.set(redis_key, serialized_data, expire=self._search_cache_ttl)
            logger.debug(f"Cached {len(results)} search results for key: {redis_key}")
        except Exception as e:
            logger.error(f"Failed to cache search results to Redis: {e}")

    async def _get_cached_searching_result(self, redis_key: str, limit: int = 10, cursor: int | None = None) -> tuple[list[dict], int | None]:
        """
        Đọc và cắt trang (paginate) kết quả chunk từ Redis Cache.
        """
        try:
            cached_data = await self.redis_service.get(redis_key)
            if not cached_data:
                return [], None
            
            all_results: list[dict] = json.loads(cached_data)
            start_idx = cursor or 0
            
            paginated_results = all_results[start_idx : start_idx + limit]
            next_cursor = (start_idx + limit) if len(all_results) > (start_idx + limit) else None
            
            return paginated_results, next_cursor
        except Exception as e:
            logger.error(f"Error reading search cache from Redis: {e}")
            return [], None

    # ==================== PHẦN XỬ LÝ METADATA & INFLIGHT REQUESTS ====================

    async def get_metadata_grpc(self, video_ids: list[str]) -> list[dict]:
        try:
            grpc_response = await self.grpc_service.get_video_metadata(video_ids)
            if grpc_response is None:
                return []

            return [
                {
                    "video_id": item.video_id,
                    "title": item.title,
                    "description": item.description,
                    "thumbnail_url": item.thumbnail_url,
                    "view": item.view,
                    "date": item.date,
                    "channel": item.channel,
                    "visibility": getattr(item, "visibility", "PUBLIC"),
                }
                for item in grpc_response
            ]
        finally:
            for video_id in video_ids:
                if video_id in self._inflight_requests:
                    self._inflight_requests[video_id].set()
                    self._inflight_requests.pop(video_id, None)

    async def _await_cache_metadata(self, video_ids: list[str]):
        await asyncio.gather(*(self._inflight_requests[video_id].wait() for video_id in video_ids))
        return await self.redis_service.mget_with_ttl([f"meta:{id}" for id in video_ids])

    async def _handle_metadata(self, video_ids: list[str]) -> list[dict]:
        next_caching_data = []
        missing_ids = []

        cached_data = await self.redis_service.mget_with_ttl([f"meta:{id}" for id in video_ids])
        result_metadata: list[dict] = [item["value"] for item in cached_data if item["value"] is not None]

        for item in cached_data:
            if item["value"] is None:
                missing_ids.append(item["key"].split(":")[1])
            elif item["value"] is not None and item["ttl"] < self._meta_cache_ttl / 2:
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
                self._await_cache_metadata(on_request_ids) if on_request_ids else asyncio.sleep(0, result=[]),
            )

            if cached_response:
                result_metadata.extend([item["value"] for item in cached_response if item["value"] is not None])

            if grpc_response:
                for item in grpc_response:
                    result_metadata.append(item)
                    next_caching_data.append((f"meta:{item['video_id']}", item))

        if next_caching_data:
            asyncio.create_task(self.redis_service.mset(next_caching_data, expire=self._meta_cache_ttl))

        return result_metadata

    # ==================== HÀM SEARCH CHÍNH (HỢP NHẤT CACHE & CHUNK AI) ====================

    async def search(
        self, user_id: str, query: str, limit: int = 10, cursor: int | None = None
    ) -> tuple[list[dict], int | None]:
        
        redis_key = self._get_search_cache_key(user_id, query)

        # 1. KIỂM TRA CACHE TRƯỚC: Nếu người dùng đang phân trang (cursor), lấy ngay từ Redis
        if cursor is not None:
            cached_results, next_cursor = await self._get_cached_searching_result(redis_key, limit, cursor)
            if cached_results:
                logger.debug(f"Serving paginated search results from cache for cursor: {cursor}")
                return cached_results, next_cursor

        # 2. CHUẨN HÓA & TẠO VECTOR TRUY VẤN
        normalized_query = standard_normalize(query)
        try:
            query_dense_vector = await self.embedding_service.embed_query(normalized_query)
        except Exception as e:
            logger.error(f"Error occurred while embedding query: {e}")
            raise Exception("Error occurred while embedding query") from e

        # 3. TÌM KIẾM CHUNK TRÊN QDRANT (Multimodal AI)
        fetch_limit = (cursor or 0) + limit * 3 
        chunk_results = await self.chunk_qdrant_service.search_chunks(
            query_vector=query_dense_vector,
            limit=fetch_limit,
        )

        ordered_chunks = sorted(chunk_results, key=lambda c: c.score, reverse=True)
        unique_video_ids = list({c.payload["videoId"] for c in ordered_chunks})

        # 4. LẤY THÔNG TIN METADATA TỪ CACHE/gRPC
        result_metadata = await self._handle_metadata(unique_video_ids)
        metadata_map = {item["video_id"]: item for item in result_metadata if isinstance(item, dict) and "video_id" in item}

        # 5. GHÉP KẾT QUẢ, LỌC QUYỀN RIÊNG TƯ & TẠO PUBLIC URL
        results = []
        for chunk in ordered_chunks:
            video_id = chunk.payload["videoId"]
            owner_id = chunk.payload.get("userOwner")
            metadata = metadata_map.get(video_id)

            if metadata is None:
                continue

            is_owner = (owner_id == user_id) or (metadata.get("channel", {}).get("id") == user_id if isinstance(metadata.get("channel"), dict) else False)
            is_public = metadata.get("visibility") == "PUBLIC"

            if not (is_owner or is_public):
                continue

            thumb_path = metadata.get("thumbnail_url", "")
            try:
                thumbnail_url = self._s3_client.generate_public_resource_url(thumb_path) if thumb_path else ""
            except Exception:
                thumbnail_url = thumb_path

            results.append({
                "video_id": video_id,
                "title": metadata.get("title", ""),
                "description": metadata.get("description", "") or "",
                "view": metadata.get("view", 0),
                "date": metadata.get("date", ""),
                "channel": metadata.get("channel", {}),
                "start": chunk.payload.get("start", 0),
                "end": chunk.payload.get("end", 0),
                "matched_text": chunk.payload.get("text", ""),
                "score": chunk.score,
                "thumbnail_url": thumbnail_url,
            })

        # 6. LƯU CACHE BẤT ĐỒNG BỘ TOÀN BỘ DANH SÁCH SẠCH VÀO REDIS
        if results:
            asyncio.create_task(self._cache_searching_result(redis_key, results))

        # 7. PHÂN TRANG VÀ TRẢ VỀ TUPLE CHUẨN
        start_idx = cursor or 0
        paginated_results = results[start_idx : start_idx + limit]
        next_cursor = (start_idx + limit) if len(results) > (start_idx + limit) else None

        return paginated_results, next_cursor