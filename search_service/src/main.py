import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from infrastructure.queue import rabbitmq_consumer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):

    connection = await rabbitmq_consumer.start_consumer()
    dlq_connection = await rabbitmq_consumer.start_dlq_consumer()

    yield

    await connection.close()
    await dlq_connection.close()

app = FastAPI(title="Video Platform AI Service", lifespan=lifespan)

@app.get("/health")
def health_check():
    return {"status": "ok"}

