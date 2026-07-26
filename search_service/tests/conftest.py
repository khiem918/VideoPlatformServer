import os

# --- 1. Thiết lập biến môi trường dummy để vượt qua Pydantic ValidationError & AWS S3 ---
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_REGION", "us-east-1")
os.environ.setdefault("API_SERVICE_GRPC_URL", "localhost:50051")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5438/test_db")
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")
os.environ.setdefault("RABBITMQ_URI", "amqp://guest:guest@localhost:5672/")
os.environ.setdefault("REDIS_URL", "redis://localhost:6380/0")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "test-key")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test-secret")
os.environ.setdefault("S3_BUCKET_NAME", "test-bucket")
os.environ.setdefault("JWT_SECRET", "super-secret-test-key")

import importlib
import sys
import types
from unittest.mock import AsyncMock, MagicMock
import pytest


def install_container_stub() -> MagicMock:
    existing = sys.modules.get("src.app.container")
    if existing is not None and hasattr(existing, "container"):
        return existing.container

    stub_container = MagicMock(name="container")
    
    # Core & Database Services
    stub_container.search_service = AsyncMock(name="search_service")
    stub_container.video = AsyncMock(name="video")
    stub_container.postgres = AsyncMock(name="postgres")
    stub_container.redis_service = AsyncMock(name="redis_service")
    stub_container.s3_client = MagicMock(name="s3_client")

    # gRPC Services
    stub_container.grpc_client = AsyncMock(name="grpc_client")
    stub_container.grpc_server = AsyncMock(name="grpc_server")

    # --- ĐIỀU CHỈNH 2: Bổ sung mock cho AI & Chunk Services ---
    stub_container.qdrant = AsyncMock(name="qdrant")
    stub_container.chunk_qdrant = AsyncMock(name="chunk_qdrant")       # Phục vụ RAG chunk search
    stub_container.transcription = MagicMock(name="transcription")     # Phục vụ Whisper AI
    stub_container.caption = MagicMock(name="caption")                 # Phục vụ BLIP Image Captioning
    stub_container.embedding = MagicMock(name="embedding")             # Phục vụ Text Embedding

    stub_module = types.ModuleType("src.app.container")
    stub_module.container = stub_container
    stub_module.Container = MagicMock(name="Container")
    sys.modules["src.app.container"] = stub_module

    try:
        app_pkg = importlib.import_module("src.app")
        app_pkg.container = stub_module
    except ImportError:
        pass

    return stub_container


# --- ĐIỀU CHỈNH 1: Gọi hàm ngay ở Top-level Scope (Toàn cục) ---
# Thao tác này chạy lập tức khi Pytest nạp file conftest.py, 
# giúp tráo đổi sys.modules trước giai đoạn collection để ngăn chặn ValidationError.
_GLOBAL_STUB_CONTAINER = install_container_stub()


@pytest.fixture
def mock_container():
    stub_container = _GLOBAL_STUB_CONTAINER
    stub_container.reset_mock(side_effect=False, return_value=False)
    
    # Đảm bảo các mock chính luôn sẵn sàng sau mỗi lần reset
    stub_container.search_service = AsyncMock(name="search_service")
    stub_container.video = AsyncMock(name="video")
    stub_container.chunk_qdrant = AsyncMock(name="chunk_qdrant")
    stub_container.qdrant = AsyncMock(name="qdrant")
    
    yield stub_container