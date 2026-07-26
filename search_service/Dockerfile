# search_service: FastAPI HTTP API + RabbitMQ consumer + BullMQ semantic worker
# + gRPC server/client, tất cả khởi động từ lifespan của main.py.
#
# Toàn bộ model ML (fastembed dense/sparse, faster-whisper, BLIP) được pre-warm
# vào image lúc build → container không cần network lúc startup và boot trong
# thời gian xác định. Đổi lại image nặng nhiều GB (xem ghi chú cuối file).

FROM python:3.12-slim AS runtime

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    WHISPER_MODEL_SIZE=small

# ffmpeg + ffprobe: bắt buộc cho video_processing_service.py
# (_extract_audio, _extract_frames, _get_video_duration)
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential curl ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# torch CPU-only cài trước để pip resolve đúng wheel nhẹ thay vì bản CUDA.
# caption_service.py (BLIP) cần torch.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ─── Pre-warm models ────────────────────────────────────────────────────────
# Đặt TRƯỚC "COPY . ." để layer cache không bị invalidate mỗi lần sửa code.

RUN python -c "from fastembed import TextEmbedding, SparseTextEmbedding; \
TextEmbedding('intfloat/multilingual-e5-large'); \
SparseTextEmbedding('Qdrant/bm25')"

# Đọc từ env để chắc chắn model pre-warm khớp với model runtime sẽ load.
RUN python -c "import os; from faster_whisper import WhisperModel; \
WhisperModel(os.getenv('WHISPER_MODEL_SIZE', 'small'), device='cpu', compute_type='int8')"

RUN python -c "from transformers import BlipProcessor, BlipForConditionalGeneration; \
BlipProcessor.from_pretrained('Salesforce/blip-image-captioning-base'); \
BlipForConditionalGeneration.from_pretrained('Salesforce/blip-image-captioning-base')"

# ─── Prisma client ──────────────────────────────────────────────────────────
# Copy riêng thư mục prisma trước để "prisma generate" được cache độc lập.
# DATABASE_URL dùng ARG (không phải ENV) vì chỉ cần parse được lúc generate,
# không connect DB thật — và không muốn giá trị dummy này lọt vào image runtime.
COPY prisma ./prisma
ARG DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=core"
RUN prisma generate

COPY . .

EXPOSE 8000 50052

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]