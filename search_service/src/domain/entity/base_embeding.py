from abc import ABC, abstractmethod 
from qdrant_client.http.models import SparseVector

class BaseEmbedding(ABC):
    
    @abstractmethod
    def embed_dense(self, text: str) -> list[float]:
        pass    
    
    @abstractmethod
    def embed_sparse(self, query: str) -> SparseVector:
        pass

    @abstractmethod
    def embed_query(self, query: str) -> list[float]:
        pass


