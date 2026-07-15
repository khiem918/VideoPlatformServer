from src.infrastructure.s3.s3_client import S3Client
from src.domain.service.search import SearchService
from src.infrastructure.redis.redis import RedisService
from src.infrastructure.ml_model.embeding_model import EmbeddingService
from src.infrastructure.database.qdrant import QdrantService
from src.infrastructure.database.chunk_qdrant import ChunkQdrantService       
from src.infrastructure.database.postgres import PostgresService
from src.domain.service.metadata_process import MetadataProcessService
from src.infrastructure.grpc.grpc_client import GrpcClient
from src.domain.service.transcription_service import TranscriptionService      
from src.domain.service.video_processing_service import VideoProcessingService
from src.domain.service.caption_service import CaptionService

class Container:
    def __init__(self):

        self.embedding     = EmbeddingService()
        self.qdrant        = QdrantService()
        self.chunk_qdrant  = ChunkQdrantService()
        self.postgres      = PostgresService()
        self.redis_service = RedisService()
        self.grpc_client   = GrpcClient()
        self.s3_client     = S3Client()
        self.caption       = CaptionService()

        self.metadata_process = MetadataProcessService(
            embedding=self.embedding,
            qdrant=self.qdrant,
        )

        self.search_service = SearchService(
            embedding_service=self.embedding,
            chunk_qdrant_service=self.chunk_qdrant,
            redis_service=self.redis_service,
            grpc_service=self.grpc_client,
            s3_client=self.s3_client,
        )

        self.transcription = TranscriptionService()

        self.video_processing = VideoProcessingService(
            transcription=self.transcription,
            embedding=self.embedding,    
            chunk_qdrant=self.chunk_qdrant,
            s3_client=self.s3_client,    
            caption=self.caption,
        )


container = Container()