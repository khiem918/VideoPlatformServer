from src.domain.service.normalize import normalize_title, normalize_desc
from src.infrastructure.ml_model.embeding_model import EmbeddingService
from src.infrastructure.database.qdrant import QdrantService


class MetadataProcessService:

    def __init__(self, embedding: EmbeddingService, qdrant: QdrantService):
        self.embedding = embedding
        self.qdrant = qdrant

    async def process(self, video_id: str, title: str, desc: str | None, user_id: str | None = None, visibility: str | None = None,) -> None:

        title = normalize_title(title)

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
            user_id=user_id,
            visibility=visibility,
        )

        

