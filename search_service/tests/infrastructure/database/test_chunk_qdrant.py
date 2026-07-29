import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.infrastructure.database import chunk_qdrant as chunk_qdrant_module
from src.infrastructure.database.chunk_qdrant import (
    CHUNK_COLLECTION_NAME,
    ChunkQdrantService,
)


@pytest.fixture
def service(mocker):
    mocker.patch.object(chunk_qdrant_module, "AsyncQdrantClient", MagicMock())
    instance = ChunkQdrantService()
    instance._client = AsyncMock()
    return instance


def make_chunk(video_id="video-1", text="hello", start=0.0, end=25.0):
    return {
        "video_id": video_id,
        "user_owner": "user-1",
        "start": start,
        "end": end,
        "text": text,
        "source": "audio",
        "created_at": 1000,
    }


class TestInitCollection:
    async def test_creates_collection_when_it_does_not_exist(self, service):
        existing = MagicMock()
        existing.name = "other-collection"
        response = MagicMock(collections=[existing])
        service._client.get_collections.return_value = response

        await service.init_collection()

        service._client.create_collection.assert_awaited_once()
        call_kwargs = service._client.create_collection.await_args.kwargs
        assert call_kwargs["collection_name"] == CHUNK_COLLECTION_NAME

    async def test_skips_creation_when_collection_already_exists(self, service):
        existing = MagicMock()
        existing.name = CHUNK_COLLECTION_NAME
        response = MagicMock(collections=[existing])
        service._client.get_collections.return_value = response

        await service.init_collection()

        service._client.create_collection.assert_not_awaited()


class TestEnsurePayloadIndexes:
    async def test_creates_payload_index_for_each_configured_field(self, service):
        await service._ensure_payload_indexes()

        assert service._client.create_payload_index.await_count == 5

    async def test_continues_when_creating_one_index_fails(self, service):
        service._client.create_payload_index.side_effect = [
            RuntimeError("already exists"),
            None,
            None,
            None,
            None,
        ]

        await service._ensure_payload_indexes()

        assert service._client.create_payload_index.await_count == 5


class TestUpsertChunks:
    async def test_does_nothing_when_chunks_list_is_empty(self, service):
        await service.upsert_chunks([], [])

        service._client.upsert.assert_not_awaited()

    async def test_builds_deterministic_point_ids_from_video_id_and_index(
        self, service
    ):
        chunks = [make_chunk(video_id="video-1")]
        vectors = [[0.1] * 1024]

        await service.upsert_chunks(chunks, vectors)

        call_kwargs = service._client.upsert.await_args.kwargs
        point = call_kwargs["points"][0]
        expected_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, "video-1_0"))
        assert point.id == expected_id
        assert call_kwargs["collection_name"] == CHUNK_COLLECTION_NAME

    async def test_maps_chunk_fields_into_payload(self, service):
        chunks = [make_chunk(video_id="video-1", text="some text")]
        vectors = [[0.1] * 1024]

        await service.upsert_chunks(chunks, vectors)

        point = service._client.upsert.await_args.kwargs["points"][0]
        assert point.payload["videoId"] == "video-1"
        assert point.payload["userOwner"] == "user-1"
        assert point.payload["text"] == "some text"
        assert point.payload["source"] == "audio"
        assert point.payload["createdAt"] == 1000

    async def test_defaults_visibility_to_draft_when_missing(self, service):
        chunks = [make_chunk()]
        vectors = [[0.1] * 1024]

        await service.upsert_chunks(chunks, vectors)

        point = service._client.upsert.await_args.kwargs["points"][0]
        assert point.payload["visibility"] == "DRAFT"

    async def test_uses_provided_visibility_when_present(self, service):
        chunk = make_chunk()
        chunk["visibility"] = "PUBLIC"
        vectors = [[0.1] * 1024]

        await service.upsert_chunks([chunk], vectors)

        point = service._client.upsert.await_args.kwargs["points"][0]
        assert point.payload["visibility"] == "PUBLIC"

    async def test_zips_multiple_chunks_and_vectors_by_position(self, service):
        chunks = [make_chunk(video_id="video-1", text="a"), make_chunk(video_id="video-1", text="b")]
        vectors = [[0.1] * 1024, [0.2] * 1024]

        await service.upsert_chunks(chunks, vectors)

        points = service._client.upsert.await_args.kwargs["points"]
        assert len(points) == 2
        assert points[0].payload["text"] == "a"
        assert points[1].payload["text"] == "b"


class TestDeleteChunksByVideoId:
    async def test_deletes_by_video_id_filter(self, service):
        await service.delete_chunks_by_video_id("video-1")

        call_kwargs = service._client.delete.await_args.kwargs
        assert call_kwargs["collection_name"] == CHUNK_COLLECTION_NAME
        condition = call_kwargs["points_selector"].filter.must[0]
        assert condition.key == "videoId"
        assert condition.match.value == "video-1"


class TestSearchChunks:
    async def test_queries_with_transcript_dense_vector_name(self, service):
        service._client.query_points.return_value = MagicMock(points=[])

        await service.search_chunks(query_vector=[0.1, 0.2], limit=5)

        call_kwargs = service._client.query_points.await_args.kwargs
        assert call_kwargs["using"] == "transcript"
        assert call_kwargs["limit"] == 5
        assert call_kwargs["collection_name"] == CHUNK_COLLECTION_NAME

    async def test_filter_always_allows_public_visibility(self, service):
        service._client.query_points.return_value = MagicMock(points=[])

        await service.search_chunks(query_vector=[0.1], limit=5)

        search_filter = service._client.query_points.await_args.kwargs["query_filter"]
        privacy_filter = search_filter.must[0]
        assert any(
            cond.key == "visibility" and cond.match.value == "PUBLIC"
            for cond in privacy_filter.should
        )

    async def test_filter_includes_current_user_id_when_provided(self, service):
        service._client.query_points.return_value = MagicMock(points=[])

        await service.search_chunks(
            query_vector=[0.1], limit=5, current_user_id="user-1"
        )

        search_filter = service._client.query_points.await_args.kwargs["query_filter"]
        privacy_filter = search_filter.must[0]
        assert any(
            cond.key == "userOwner" and cond.match.value == "user-1"
            for cond in privacy_filter.should
        )

    async def test_adds_filter_by_user_as_must_condition_when_provided(self, service):
        service._client.query_points.return_value = MagicMock(points=[])

        await service.search_chunks(
            query_vector=[0.1], limit=5, filter_by_user="owner-1"
        )

        search_filter = service._client.query_points.await_args.kwargs["query_filter"]
        assert len(search_filter.must) == 2
        assert search_filter.must[1].key == "userOwner"
        assert search_filter.must[1].match.value == "owner-1"

    async def test_passes_score_threshold_only_when_provided(self, service):
        service._client.query_points.return_value = MagicMock(points=[])

        await service.search_chunks(query_vector=[0.1], limit=5)

        assert "score_threshold" not in service._client.query_points.await_args.kwargs

        await service.search_chunks(query_vector=[0.1], limit=5, score_threshold=0.5)

        assert service._client.query_points.await_args.kwargs["score_threshold"] == 0.5

    async def test_returns_scored_points_from_result(self, service):
        expected_points = [MagicMock()]
        service._client.query_points.return_value = MagicMock(points=expected_points)

        result = await service.search_chunks(query_vector=[0.1], limit=5)

        assert result == expected_points


class TestGetChunksByVideoId:
    async def test_sorts_returned_points_by_start_time(self, service):
        point_late = MagicMock(payload={"start": 25.0})
        point_early = MagicMock(payload={"start": 0.0})
        service._client.scroll.return_value = ([point_late, point_early], None)

        result = await service.get_chunks_by_video_id("video-1")

        assert result == [point_early, point_late]

    async def test_scrolls_with_video_id_filter(self, service):
        service._client.scroll.return_value = ([], None)

        await service.get_chunks_by_video_id("video-1")

        call_kwargs = service._client.scroll.await_args.kwargs
        assert call_kwargs["collection_name"] == CHUNK_COLLECTION_NAME
        condition = call_kwargs["scroll_filter"].must[0]
        assert condition.key == "videoId"
        assert condition.match.value == "video-1"
