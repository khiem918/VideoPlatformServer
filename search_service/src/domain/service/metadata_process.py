import src.app.container as container
from src.domain.service.normalize import normalize_title, normalize_desc

class MetadataProcessService:
    
    async def process(self, video_id: str, title: str, desc: str | None) -> None:
        
        title = normalize_title(title)
        
        if desc:
            desc = normalize_desc(desc)

        title_vector = container.EmbeddingService.embed_dense(title) 
        desc_vector = container.EmbeddingService.embed_dense(desc) if desc else None
        sparse_vector = container.EmbeddingService.embed_sparse(title + " " + desc) 

        await container.QdrantService.upsert_video_point(
            video_id=video_id,
            title_vector=title_vector,
            desc_vector=desc_vector,
            sparse_vector=sparse_vector,
            title=title,
            desc=desc if desc else "",
        )

        return 

        

        

        
        

        
        




    