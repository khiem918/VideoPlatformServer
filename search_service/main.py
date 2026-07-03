import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from src.app.container import container
from src.app.worker.consumer import start_consumer
from src.app.worker.dlq_consumer import start_dlq_consumer

load_dotenv("src/.env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):

    container.embedding.load_model()

    await container.qdrant.init_collection()
    await container.postgres.connect()
    await container.grpc_client.connect()
    await container.redis_service.connect()

    app.state.container = container

    connection = await start_consumer()
    dlq_connection = await start_dlq_consumer()

    yield

    await connection.close()
    await dlq_connection.close()
    await container.postgres.disconnect()
    await container.grpc_client.close()
    await container.redis_service.disconnect()

app = FastAPI(title="search service", lifespan=lifespan)

@app.get("/health")
def health_check():
    return {"status": "ok"}
