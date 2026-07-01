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
        self.metadata_process = MetadataProcessService(
            embedding=self.embedding,
            qdrant=self.qdrant,
        )
        self.grpc_client = GrpcClient()

container = Container()
