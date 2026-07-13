import os
import logging
import uuid
from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models

logger = logging.getLogger(__name__)

CHUNK_COLLECTION_NAME = "video_chunks"
VECTOR_DIMENSION = 1024

CHUNK_VECTOR_NAMES = {
    "transcriptDense": "transcript",
}


class ChunkQdrantService:
    def __init__(self):
        self._client = AsyncQdrantClient(
            url=os.getenv("QDRANT_URL", "http://localhost:6333")
        )

    async def init_collection(self):
        resp = await self._client.get_collections()
        exists = any(c.name == CHUNK_COLLECTION_NAME for c in resp.collections)

        if not exists:
            await self._client.create_collection(
                collection_name=CHUNK_COLLECTION_NAME,
                vectors_config={
                    CHUNK_VECTOR_NAMES["transcriptDense"]: models.VectorParams(
                        size=VECTOR_DIMENSION,
                        distance=models.Distance.COSINE,
                    ),
                },
                hnsw_config=models.HnswConfigDiff(
                    m=32,
                    ef_construct=200,
                    full_scan_threshold=2000,
                    on_disk=False,
                ),
                optimizers_config=models.OptimizersConfigDiff(
                    memmap_threshold=20000,
                ),
            )
            logger.info(f"Collection '{CHUNK_COLLECTION_NAME}' created successfully.")
        else:
            logger.info(f"Collection '{CHUNK_COLLECTION_NAME}' already exists.")

    async def _ensure_payload_indexes(self):
        indexes = [
            ("videoId",   models.PayloadSchemaType.KEYWORD),
            ("userOwner", models.PayloadSchemaType.KEYWORD),
            ("source",    models.PayloadSchemaType.KEYWORD),  # 'audio' | 'caption'
            ("createdAt", models.PayloadSchemaType.INTEGER),
        ]

        for field_name, field_type in indexes:
            try:
                await self._client.create_payload_index(
                    collection_name=CHUNK_COLLECTION_NAME,
                    field_name=field_name,
                    field_schema=field_type,
                )
                logger.info(f"Payload index '{field_name}' created successfully.")
            except Exception as e:
                logger.warning(f"Failed to create payload index '{field_name}': {e}")

    # ─────────────────────────────────────────────
    # Write
    # ─────────────────────────────────────────────

    async def upsert_chunks(
        self,
        chunks: list[dict],
        transcript_vectors: list[list[float]],
    ) -> None:
        """
        Upsert toàn bộ chunk của 1 video cùng lúc (batch).

        Args:
            chunks: list chunk từ merge_segments_to_chunks(), mỗi chunk gồm:
                    { text, start, end, no_speech_prob_avg, video_id,
                      user_owner, source, created_at }
            transcript_vectors: list vector 768 chiều từ embed_texts(),
                                 thứ tự phải khớp 1-1 với chunks
        """
        if not chunks:
            return

        points = [
            models.PointStruct(
                id=str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{chunk['video_id']}_{i}")),
                vector={
                    CHUNK_VECTOR_NAMES["transcriptDense"]: vector,
                },
                payload={
                    "videoId":    chunk["video_id"],
                    "userOwner":  chunk["user_owner"],
                    "start":      chunk["start"],
                    "end":        chunk["end"],
                    "text":       chunk["text"],
                    "source":     chunk["source"],
                    "createdAt":  chunk["created_at"],
                },
            )
            for i, (chunk, vector) in enumerate(zip(chunks, transcript_vectors))
        ]

        await self._client.upsert(
            collection_name=CHUNK_COLLECTION_NAME,
            wait=True,
            points=points,
        )
        logger.info(
            f"Upserted {len(points)} chunks for video: {chunks[0]['video_id']}"
        )

    async def delete_chunks_by_video_id(self, video_id: str) -> None:
        """
        Xoá toàn bộ chunk của 1 video — dùng khi video bị xoá hoặc cần re-index.
        Filter theo payload thay vì ID vì không biết trước có bao nhiêu chunk.
        """
        await self._client.delete(
            collection_name=CHUNK_COLLECTION_NAME,
            wait=True,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="videoId",
                            match=models.MatchValue(value=video_id),
                        )
                    ]
                )
            ),
        )
        logger.info(f"Deleted all chunks for video: {video_id}")

    # ─────────────────────────────────────────────
    # Search
    # ─────────────────────────────────────────────

    async def search_chunks(
        self,
        query_vector: list[float],
        limit: int = 10,
        filter_by_user: str | None = None,
        score_threshold: float | None = None,
    ) -> list[models.ScoredPoint]:
        """
        Tìm kiếm chunk gần nhất với query vector.

        Args:
            query_vector:    vector 768 chiều của câu query (đã embed bằng e5)
            limit:           số kết quả tối đa trả về
            filter_by_user:  nếu có, chỉ search trong chunk của user này
            score_threshold: nếu có, chỉ trả về chunk có score >= ngưỡng này
        """
        search_filter = None
        if filter_by_user:
            search_filter = models.Filter(
                must=[
                    models.FieldCondition(
                        key="userOwner",
                        match=models.MatchValue(value=filter_by_user),
                    )
                ]
            )

        result = await self._client.query_points(
            collection_name=CHUNK_COLLECTION_NAME,
            query=query_vector,
            using=CHUNK_VECTOR_NAMES["transcriptDense"],
            limit=limit,
            with_payload=True,
            with_vectors=False,
            **({"query_filter": search_filter} if search_filter else {}),
            **({"score_threshold": score_threshold} if score_threshold else {}),
        )

        return result.points

    async def get_chunks_by_video_id(self, video_id: str) -> list[models.ScoredPoint]:
        """
        Lấy toàn bộ chunk của 1 video theo thứ tự thời gian.
        Dùng để debug hoặc hiển thị toàn bộ transcript đã index.
        """
        result = await self._client.scroll(
            collection_name=CHUNK_COLLECTION_NAME,
            scroll_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="videoId",
                        match=models.MatchValue(value=video_id),
                    )
                ]
            ),
            with_payload=True,
            with_vectors=False,
            limit=1000,
        )

        # Sắp xếp theo start time để đúng thứ tự xuất hiện trong video
        points = result[0]
        points.sort(key=lambda p: p.payload.get("start", 0))
        return points