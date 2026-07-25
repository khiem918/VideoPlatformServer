import asyncio

import pytest
from unittest.mock import AsyncMock, MagicMock

from src.domain.service.video import Video


@pytest.fixture
def embedding():
    mock = MagicMock()
    mock.embed_dense = AsyncMock(return_value=[0.1, 0.2, 0.3])
    mock.embed_sparse = AsyncMock(return_value={"indices": [1], "values": [0.5]})
    return mock


@pytest.fixture
def qdrant():
    mock = MagicMock()
    mock.upsert_video_point = AsyncMock()
    return mock


@pytest.fixture
def redis():
    mock = MagicMock()
    mock.delete_by_pattern = AsyncMock()
    return mock


@pytest.fixture
def video_service(embedding, qdrant, redis):
    return Video(embedding=embedding, qdrant=qdrant, redis=redis)


def _close_if_coroutine(value):
    if asyncio.iscoroutine(value):
        value.close()


class TestProcessMetadata:
    async def test_normalizes_title_before_upserting(self, video_service, qdrant):
        await video_service.process_metadata("video-1", "Hello World!", None)

        kwargs = qdrant.upsert_video_point.await_args.kwargs
        assert kwargs["title"] == "hello world"
        assert kwargs["video_id"] == "video-1"

    async def test_normalizes_description_when_provided(self, video_service, qdrant):
        await video_service.process_metadata(
            "video-1", "Title", "Check https://spam.com out"
        )

        kwargs = qdrant.upsert_video_point.await_args.kwargs
        assert kwargs["desc"] == ""

    async def test_uses_empty_string_desc_when_desc_is_none(
        self, video_service, qdrant
    ):
        await video_service.process_metadata("video-1", "Title", None)

        kwargs = qdrant.upsert_video_point.await_args.kwargs
        assert kwargs["desc"] == ""

    async def test_uses_empty_string_desc_when_desc_is_empty_string(
        self, video_service, qdrant
    ):
        await video_service.process_metadata("video-1", "Title", "")

        kwargs = qdrant.upsert_video_point.await_args.kwargs
        assert kwargs["desc"] == ""

    async def test_desc_vector_is_none_when_desc_is_falsy(
        self, video_service, qdrant
    ):
        await video_service.process_metadata("video-1", "Title", None)

        kwargs = qdrant.upsert_video_point.await_args.kwargs
        assert kwargs["desc_vector"] is None

    async def test_bug_vectors_are_unawaited_coroutines_not_actual_values(
        self, video_service, qdrant, embedding
    ):
        await video_service.process_metadata("video-1", "Title", "A real description")

        kwargs = qdrant.upsert_video_point.await_args.kwargs

        assert asyncio.iscoroutine(kwargs["title_vector"])
        assert asyncio.iscoroutine(kwargs["desc_vector"])
        assert asyncio.iscoroutine(kwargs["sparse_vector"])

        assert embedding.embed_dense.await_count == 0
        assert embedding.embed_sparse.await_count == 0

        _close_if_coroutine(kwargs["title_vector"])
        _close_if_coroutine(kwargs["desc_vector"])
        _close_if_coroutine(kwargs["sparse_vector"])


class TestDeleteVideo:
    async def test_calls_delete_by_pattern_with_metadata_cache_key(
        self, video_service, redis
    ):
        await video_service.delete_video("video-42")

        redis.delete_by_pattern.assert_called_once_with(["meta:video-42"])

    async def test_bug_delete_by_pattern_call_is_never_awaited(
        self, video_service, redis
    ):
        result = await video_service.delete_video("video-99")

        assert redis.delete_by_pattern.await_count == 0
        assert result is None
