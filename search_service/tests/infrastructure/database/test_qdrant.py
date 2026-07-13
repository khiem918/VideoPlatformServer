from unittest.mock import AsyncMock, MagicMock

import pytest

from src.infrastructure.database import qdrant as qdrant_module
from src.infrastructure.database.qdrant import COLLECTION_NAME, QdrantService


@pytest.fixture
def service(mocker):
    mocker.patch.object(qdrant_module, "AsyncQdrantClient", MagicMock())
    instance = QdrantService()
    instance._client = AsyncMock()
    return instance


class TestInitCollection:
    async def test_creates_collection_when_it_does_not_exist(self, service):
        existing = MagicMock()
        existing.name = "other-collection"
        response = MagicMock(collections=[existing])
        service._client.get_collections.return_value = response

        await service.init_collection()

        service._client.create_collection.assert_awaited_once()
        call_kwargs = service._client.create_collection.await_args.kwargs
        assert call_kwargs["collection_name"] == COLLECTION_NAME

    async def test_skips_creation_when_collection_already_exists(self, service):
        existing = MagicMock()
        existing.name = COLLECTION_NAME
        response = MagicMock(collections=[existing])
        service._client.get_collections.return_value = response

        await service.init_collection()

        service._client.create_collection.assert_not_awaited()


class TestUpsertVideoPoint:
    async def test_includes_desc_vector_and_payload_when_desc_provided(self, service):
        await service.upsert_video_point(
            video_id="video-1",
            title_vector=[0.1, 0.2],
            desc_vector=[0.3, 0.4],
            sparse_vector=MagicMock(),
            title="a title",
            desc="a description",
        )

        call_kwargs = service._client.upsert.await_args.kwargs
        point = call_kwargs["points"][0]
        assert point.id == "video-1"
        assert "desc" in point.vector
        assert point.payload["desc"] == "a description"

    async def test_omits_desc_vector_and_payload_when_desc_vector_is_none(
        self, service
    ):
        await service.upsert_video_point(
            video_id="video-1",
            title_vector=[0.1, 0.2],
            desc_vector=None,
            sparse_vector=MagicMock(),
            title="a title",
            desc="",
        )

        call_kwargs = service._client.upsert.await_args.kwargs
        point = call_kwargs["points"][0]
        assert "desc" not in point.vector
        assert "desc" not in point.payload


class TestSearchPoints:
    async def test_bug_raises_validation_error_due_to_fusionquery_field_name_mismatch(
        self, service
    ):
        from pydantic import ValidationError

        service._client.query_points.return_value = MagicMock(points=[])

        with pytest.raises(ValidationError, match="fusion"):
            await service.search_points([0.1], MagicMock(), limit=15)

        service._client.query_points.assert_not_awaited()


class TestDeleteVideoPoint:
    async def test_deletes_point_by_video_id(self, service):
        await service.delete_video_point("video-1")

        call_kwargs = service._client.delete.await_args.kwargs
        assert call_kwargs["collection_name"] == COLLECTION_NAME
        assert call_kwargs["points_selector"].points == ["video-1"]


class TestEnsurePayloadIndexes:
    async def test_creates_payload_index_for_each_configured_field(self, service):
        await service._ensure_payload_indexes()

        assert service._client.create_payload_index.await_count == 2

    async def test_continues_when_creating_one_index_fails(self, service):
        service._client.create_payload_index.side_effect = [
            RuntimeError("already exists"),
            None,
        ]

        await service._ensure_payload_indexes()

        assert service._client.create_payload_index.await_count == 2
