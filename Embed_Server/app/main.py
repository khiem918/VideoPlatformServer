import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from service.embedding_model import EmbeddingService
from service.summarization_model import SummarizationService
from rabbitmq_consumer import RabbitMqRpcConsumer


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

embedding_service = EmbeddingService()
summarization_service = SummarizationService()
rabbitmq_consumer = RabbitMqRpcConsumer(embedding_service, summarization_service)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await rabbitmq_consumer.start()
    yield
    await rabbitmq_consumer.stop()


app = FastAPI(title="Video Platform AI Service", lifespan=lifespan)


@app.get("/health")
def health_check():
    return {"status": "ok", "model_loaded": embedding_service.model is not None}

