from src.infrastructure.s3.s3_client import S3Client
from src.domain.service.search import SearchService
from src.infrastructure.redis.redis import RedisService
from src.infrastructure.ml_model.embeding_model import EmbeddingService
from src.infrastructure.database.qdrant import QdrantService
from src.infrastructure.database.postgres import PostgresService
from src.infrastructure.grpc.grpc_client import GrpcClient

# --- Các module từ nhánh main ---
from src.domain.service.video import Video
from src.infrastructure.grpc.grpc_server import GrpcServer

# --- Các module từ nhánh feat (Multimodal AI & Chunking) ---
from src.infrastructure.database.chunk_qdrant import ChunkQdrantService
from src.domain.service.transcription_service import TranscriptionService
from src.domain.service.video_processing_service import VideoProcessingService
from src.domain.service.caption_service import CaptionService


class Container:
    def __init__(self):
        # 1. Khởi tạo hạ tầng cốt lõi & Mô hình AI
        self.embedding     = EmbeddingService()
        self.qdrant        = QdrantService()
        self.chunk_qdrant  = ChunkQdrantService()  # Từ feat
        self.postgres      = PostgresService()
        self.redis_service = RedisService()
        self.grpc_client   = GrpcClient()
        self.s3_client     = S3Client()
        self.caption       = CaptionService()        # Từ feat
        self.transcription = TranscriptionService()  # Từ feat

        # 2. Domain Service từ nhánh main
        self.video = Video(
            embedding=self.embedding,
            qdrant=self.qdrant,
            redis=self.redis_service
        )

        # 3. Domain Service từ nhánh feat
        self.video_processing = VideoProcessingService(
            transcription=self.transcription,
            embedding=self.embedding,
            chunk_qdrant=self.chunk_qdrant,
            s3_client=self.s3_client,
            caption=self.caption,
        )

        # 4. Search Service kết hợp cả Qdrant level video và level chunk
        self.search_service = SearchService(
            embedding_service=self.embedding,
            qdrant_service=self.qdrant,              # Từ main
            chunk_qdrant_service=self.chunk_qdrant,  # Từ feat
            redis_service=self.redis_service,
            grpc_service=self.grpc_client,
            s3_client=self.s3_client,
        )

        # 5. gRPC Server từ nhánh main
        self.grpc_server = GrpcServer()


container = Container()