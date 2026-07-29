# search_service: FastAPI HTTP API + RabbitMQ consumer + gRPC server/client,
# all started together from main.py's lifespan (see main.py).
#
# EmbeddingService.load_model() (src/infrastructure/ml_model/embeding_model.py)
# downloads the fastembed dense/sparse ONNX models from HuggingFace on first
# use; pre-warming them into the image at build time means the container
# doesn't need network access at startup and boots in bounded time. This is
# a multi-hundred-MB download during the image build.

FROM python:3.14-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential curl \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

RUN python -c "from fastembed import TextEmbedding, SparseTextEmbedding; \
TextEmbedding('intfloat/multilingual-e5-large'); \
SparseTextEmbedding('Qdrant/bm25')"

RUN python -c "from faster_whisper import WhisperModel; \
WhisperModel('small', device='cpu', compute_type='int8')"

RUN python -c "from transformers import BlipProcessor, BlipForConditionalGeneration; \
BlipProcessor.from_pretrained('Salesforce/blip-image-captioning-base'); \
BlipForConditionalGeneration.from_pretrained('Salesforce/blip-image-captioning-base')"

COPY . .

# prisma-client-py generates the client straight into site-packages/prisma
# rather than a project subdirectory, so this must run in this image after
# the schema is copied and before the app imports `prisma`.
RUN prisma generate

EXPOSE 8000 50052

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8000/api/v1/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
