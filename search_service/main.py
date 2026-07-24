import logging
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).resolve().with_name(".env"))

from src.core.config import config
from src.app.api.v1.routes import routers
from src.app.container import container
from src.app.worker.consumer import start_consumer
from src.app.worker.dlq_consumer import start_dlq_consumer
from src.app.worker.semantic_worker import start_semantic_worker # Từ nhánh feat

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Tải toàn bộ các mô hình AI (Kết hợp từ feat)
    container.embedding.load_model()
    container.transcription.load_model()
    container.caption.load_model()

    # 2. Khởi tạo Database Collections & Indexes (Kết hợp từ feat)
    await container.qdrant.init_collection()
    await container.chunk_qdrant.init_collection()
    await container.chunk_qdrant._ensure_payload_indexes()
    
    await container.postgres.connect()
    await container.grpc_client.connect()
    await container.redis_service.connect()
    
    # 3. Khởi tạo gRPC Server từ nhánh main (Để lắng nghe lệnh xóa video từ API Service)
    await container.grpc_server.connect()

    app.state.container = container

    # 4. Khởi động tất cả Workers (Kết hợp 2 + 1 worker)
    connection = await start_consumer()
    dlq_connection = await start_dlq_consumer()
    semantic_worker = await start_semantic_worker()

    yield

    # 5. Cleanup toàn bộ tài nguyên khi tắt server
    await semantic_worker.close()
    await connection.close()
    await dlq_connection.close()
    await container.postgres.disconnect()
    await container.grpc_client.close()
    await container.redis_service.disconnect()
    await container.grpc_server.disconnect() # Từ nhánh main

app = FastAPI(title="search service", lifespan=lifespan)

# Giữ chuẩn hóa API và CORS từ nhánh main
app.include_router(routers, prefix="/api/v1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in config.CORS_ORIGINS],
    allow_credentials=True, 
    allow_methods=["*"],
    allow_headers=["*"],
)

# Giữ lại health check từ nhánh feat cho Docker/Kubernetes probe
@app.get("/health")
def health_check():
    return {"status": "ok"}