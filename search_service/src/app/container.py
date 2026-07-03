from VideoPlatformServer.search_service.src.domain.service.search import SearchService
from VideoPlatformServer.search_service.src.infrastructure.redis.redis import RedisService
from src.infrastructure.ml_model.embeding_model import EmbeddingService
from src.infrastructure.database.qdrant import QdrantService
from src.infrastructure.database.postgres import PostgresService
from src.domain.service.metadata_process import MetadataProcessService
from src.infrastructure.grpc.grpc_client import GrpcClient

class Container:
    def __init__(self):
        
        self.embedding = EmbeddingService()
        self.qdrant = QdrantService()
        self.postgres = PostgresService()
        self.redis_service = RedisService()
        self.grpc_client = GrpcClient()
        
        self.metadata_process = MetadataProcessService(
            embedding=self.embedding,
            qdrant=self.qdrant,
        )
        
        self.search_service = SearchService(
            embedding_service=self.embedding,
            qdrant_service=self.qdrant,
            redis_service=self.redis_service
        )


container = Container()
