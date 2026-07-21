import logging
from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models
from qdrant_client.http.models import SparseVector, Modifier
from src.core.config import config


logger = logging.getLogger(__name__)

COLLECTION_NAME = "videos"
VECTOR_DEMENSION = 1024

VECTOR_NAMES = { 
    "titleDense": "title", 
    "descDense": "desc", 
    "sparse" : "sparse",
}

class QdrantService:
    def __init__(self):
        self._client = AsyncQdrantClient(
            url=config.QDRANT_URL
        )

    async def init_collection(self): 
                  
        resp = await self._client.get_collections()
        exists = any(c.name == COLLECTION_NAME for c in resp.collections)

        if not exists:
            await self._client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config={
                    VECTOR_NAMES["titleDense"]: models.VectorParams(
                                                    size=VECTOR_DEMENSION, 
                                                    distance=models.Distance.COSINE
                                                ),
                    VECTOR_NAMES["descDense"]: models.VectorParams(
                                                    size=VECTOR_DEMENSION, 
                                                    distance=models.Distance.COSINE
                                            ),
                    }, 

                    sparse_vectors_config={
                        VECTOR_NAMES["sparse"]: models.SparseVectorParams(
                            modifier  = Modifier.IDF,
                        )
                    },

                hnsw_config=models.HnswConfigDiff(
                    m = 32, 
                    ef_construct = 200,
                    full_scan_threshold = 2000, 
                    on_disk = False,
                ),

                optimizers_config=models.OptimizersConfigDiff(
                    memmap_threshold = 20000,
                ),

            )

            logger.info(f"Collection '{COLLECTION_NAME}' created successfully.")

        else: 

            logger.info(f"Collection '{COLLECTION_NAME}' already exists.")

        
    async def _ensure_payload_indexes(self):
        indexes = [
            ("title", models.PayloadSchemaType.KEYWORD),
            ("desc", models.PayloadSchemaType.KEYWORD),
        ]

        for field_name, field_type in indexes:
            try:
                await self._client.create_payload_index(
                    collection_name=COLLECTION_NAME,
                    field_name=field_name,
                    field_schema=field_type,
                )
                logger.info(f"Payload index '{field_name}' created successfully.")
            except Exception as e:
                logger.warning(f"Failed to create payload index '{field_name}': {e}")
        
    async def upsert_video_point(
        self, 
        video_id: str, 
        title_vector: list[float], 
        desc_vector: list[float] | None, 
        sparse_vector: SparseVector,
        title: str, 
        desc: str | None, 
    ) -> None:
        vector = {}

        vector[VECTOR_NAMES["titleDense"]] = title_vector

        if desc_vector is not None:
            vector[VECTOR_NAMES["descDense"]] = desc_vector

        vector[VECTOR_NAMES["sparse"]] = sparse_vector
        
        payload = {} 

        payload["title"] = title
        if desc:
            payload["desc"] = desc

        await self._client.upsert(
            collection_name=COLLECTION_NAME,
            wait= True,
            points=[
                models.PointStruct(
                    id=video_id,
                    vector=vector,
                    payload=payload
                )
            ]
        )

    """
        Problem: for points with empty vector may impact the search result. 
        Solution: excuting search on 2 dense vectors and a sparse vector parallelly, then rerank the results.
    """

    async def search_points(
            self, 
            query_dense_vector: list[float],
            query_sparse_vector: SparseVector,
            limit : int = 30,
    ) -> list[models.ScoredPoint]:
        
        result = await self._client.query_points(
            collection_name=COLLECTION_NAME,
            prefetch=[
                models.Prefetch(
                    query=query_dense_vector,
                    using=VECTOR_NAMES["titleDense"], 
                    limit=limit*2,
                ),
                models.Prefetch(
                    query=query_dense_vector,
                    using=VECTOR_NAMES["descDense"], 
                    limit=limit*2
                ),
                models.Prefetch(
                    query=query_sparse_vector,
                    using=VECTOR_NAMES["sparse"],
                    limit=limit*2
                )
            ], 
            query=models.FusionQuery(function=models.Fusion.RRF),
            limit=limit,  
            with_vectors=False,
            with_payload=True,          
        )

        return result.points

    async def delete_video_point(self, video_id: str) -> None:

        await self._client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=models.PointIdsList(
                points=[video_id]
            ), 
            wait=True
        )



