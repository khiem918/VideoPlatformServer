import logging
from fastapi import logger
import onnxruntime
from src.domain.entity.base_embeding import BaseEmbedding
from fastembed import TextEmbedding, SparseTextEmbedding
from qdrant_client.http.models import SparseVector

logger = logging.getLogger(__name__)
DENSE_MODEL = "intfloat/multilingual-e5-large"
SPARSE_MODEL = "Qdrant/bm25"

class EmbeddingService(BaseEmbedding):
    def __init__(self):
        self._dense_model : TextEmbedding | None = None
        self._sparse_model : SparseTextEmbedding | None = None

    def load_model(self):
        provider = ['CUDAExecutionProvider'] if 'CUDAExecutionProvider' in onnxruntime.get_available_providers() else ['CPUExecutionProvider']

        if self._dense_model is None:
            logger.info(f"Loading dense embedding model {DENSE_MODEL}")
            
            self._dense_model = TextEmbedding(
                provider = provider,
                model_name = DENSE_MODEL, 
            )
            
            logger.info("Dense embedding model loaded successfully")

        if self._sparse_model is None:
            logger.info(f"Loading sparse embedding model {SPARSE_MODEL}")

            self._sparse_model = SparseTextEmbedding(
                provider = provider,
                model_name = SPARSE_MODEL
            )

            logger.info("Sparse embedding model loaded successfully")

    async def embed_dense(self, text: str) -> list[float]:

        result = await list(self._dense_model.embed([f"passage: {text}"]))
        return result[0].tolist()

    async def embed_sparse(self, query: str) -> SparseVector:
        
        result = await list(self._sparse_model.embed([query]))
        sv = result[0]
        return SparseVector(
                    indices=sv.indices.tolist(), 
                    values=sv.values.tolist(),
                    )
    
    async def embed_query(self, query: str) -> list[float]:
        result = await list(self._dense_model.embed([f"query: {query}"]))
        return result[0].tolist()