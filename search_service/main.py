import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from src.app.container import Container
from src.app.worker.consumer import start_consumer
from src.app.worker.dlq_consumer import start_dlq_consumer

load_dotenv("src/.env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    
    container = Container()
    container.embedding.load_model()

    await container.qdrant.init_collection()
    await container.postgres.connect()

    app.state.container = container

    connection = await start_consumer(container)
    dlq_connection = await start_dlq_consumer(container)

    yield

    await connection.close()
    await dlq_connection.close()
    await container.postgres.disconnect()

app = FastAPI(title="search service", lifespan=lifespan)

@app.get("/health")
def health_check():
    return {"status": "ok"}

