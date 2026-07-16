from src.infrastructure.redis.redis import RedisService
from src.domain.service.normalize import standard_normalize, normalize_desc
from src.infrastructure.ml_model.embeding_model import EmbeddingService
from src.infrastructure.database.qdrant import QdrantService


class Video:

    def __init__(self, embedding: EmbeddingService, qdrant: QdrantService, redis: RedisService):
        self.embedding : EmbeddingService = embedding
        self.qdrant : QdrantService = qdrant
        self.redis : RedisService =  redis

    async def process_metadata(self, video_id: str, title: str, desc: str | None) -> None:

        title = standard_normalize(title)

        if desc:
            desc = normalize_desc(desc)

        title_vector = await self.embedding.embed_dense(title)
        desc_vector = await self.embedding.embed_dense(desc) if desc else None
        sparse_vector = await self.embedding.embed_sparse(title + " " + (desc or ""))

        """
            not yet, insert connoncial tag into postgre
        """

        await self.qdrant.upsert_video_point(
            video_id=video_id,
            title_vector=title_vector,
            desc_vector=desc_vector,
            sparse_vector=sparse_vector,
            title=title,
            desc=desc if desc else "",

        )

    async def delete_video(self, video_id: str):
        
        patterns = [
            f"meta:{video_id}", 
        ]

        self.redis.delete_by_pattern(patterns)
        
        

        

