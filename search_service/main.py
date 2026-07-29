import logging
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from src.app.api.v1.routes import routers
from fastapi.middleware.cors import CORSMiddleware
from src.core.config import config

load_dotenv(Path(__file__).resolve().with_name(".env"))

from src.app.container import container
from src.app.worker.consumer import start_consumer
from src.app.worker.dlq_consumer import start_dlq_consumer
from src.app.worker.semantic_worker import start_semantic_worker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):

    container.embedding.load_model()
    container.transcription.load_model()
    container.caption.load_model()

    await container.qdrant.init_collection()
    await container.chunk_qdrant.init_collection()
    await container.chunk_qdrant._ensure_payload_indexes()
    await container.postgres.connect()
    await container.grpc_client.connect()
    await container.redis_service.connect()
    await container.grpc_server.connect()

    app.state.container = container

    connection = await start_consumer()
    dlq_connection = await start_dlq_consumer()
    semantic_worker = await start_semantic_worker()

    yield

    await connection.close()
    await dlq_connection.close()
    await semantic_worker.close()
    await container.postgres.disconnect()
    await container.grpc_client.close()
    await container.redis_service.disconnect()
    await container.grpc_server.disconnect()

app = FastAPI(title="search service", lifespan=lifespan)
app.include_router(routers, prefix="/api/v1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in config.CORS_ORIGINS],
    allow_credentials=True, 
    allow_methods=["*"],
    allow_headers=["*"],
)