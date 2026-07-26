from unittest.mock import AsyncMock, MagicMock

import pytest

from src.domain.service.search import SearchService


@pytest.fixture
def embedding_service():
    mock = MagicMock()
    mock.embed_query = AsyncMock(return_value=[0.1, 0.2])
    mock.embed_sparse = AsyncMock(return_value={"indices": [1], "values": [0.9]})
    return mock


@pytest.fixture
def qdrant_service():
    mock = MagicMock()
    mock.search_points = AsyncMock(return_value=[])
    return mock


@pytest.fixture
def chunk_qdrant_service():
    mock = MagicMock()
    mock.search_chunks = AsyncMock(return_value=[])
    mock.search_points = AsyncMock(return_value=[])
    return mock


@pytest.fixture
def redis_service():
    mock = MagicMock()
    mock.mget_with_ttl = AsyncMock(return_value=[])
    mock.mset = AsyncMock()
    mock.zadd = AsyncMock()
    mock.zrange = AsyncMock(return_value=None)
    return mock


@pytest.fixture
def grpc_service():
    mock = MagicMock()
    mock.get_video_metadata = AsyncMock(return_value=None)
    return mock


@pytest.fixture
def s3_client():
    mock = MagicMock()
    mock.get_presigned_url = MagicMock(side_effect=lambda path, *a, **kw: f"https://cdn.example.test/{path}")
    return mock


@pytest.fixture
def search_service(
    embedding_service,
    qdrant_service,
    chunk_qdrant_service,
    redis_service,
    grpc_service,
    s3_client,
):
    return SearchService(
        embedding_service=embedding_service,
        qdrant_service=qdrant_service,
        chunk_qdrant_service=chunk_qdrant_service,
        redis_service=redis_service,
        grpc_service=grpc_service,
        s3_client=s3_client,
    )


def make_scored_point(point_id, score):
    point = MagicMock()
    point.id = point_id
    point.score = score
    return point


def make_metadata(video_id, thumbnail_path="raw/path.jpg"):
    return {
        "video_id": video_id,
        "title": f"title-{video_id}",
        "description": f"desc-{video_id}",
        "thumbnail_url": thumbnail_path,
        "view": 1,
        "date": 1234567890,
        "channel": "channel-1",
    }


class FakeGrpcMetadataItem:
    def __init__(self, video_id):
        self.video_id = video_id
        self.title = f"title-{video_id}"
        self.description = f"desc-{video_id}"
        self.thumbnail_url = f"thumb-{video_id}"
        self.view = 10
        self.date = 42
        self.channel = "chan"