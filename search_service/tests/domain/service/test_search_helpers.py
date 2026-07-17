import asyncio

import pytest

from src.core.config import config
from tests.domain.service.conftest import FakeGrpcMetadataItem, make_metadata


class TestGetSearchCacheKey:
    def test_builds_key_from_user_id_and_normalized_query(self, search_service):
        key = search_service._get_search_cache_key("user-1", "Hello World!")

        assert key == "search:user-1:hello-world-"

    def test_different_queries_produce_different_keys(self, search_service):
        first = search_service._get_search_cache_key("user-1", "cats")
        second = search_service._get_search_cache_key("user-1", "dogs")

        assert first != second


class TestArrangePresignUrlResult:
    def test_orders_results_by_ordered_result_ids(self, search_service):
        result_metadata = [make_metadata("b"), make_metadata("a")]

        result = search_service._arrange_presign_url_result(
            result_metadata, ["a", "b"]
        )

        assert [item["video_id"] for item in result] == ["a", "b"]

    def test_skips_ids_missing_from_metadata(self, search_service):
        result_metadata = [make_metadata("a")]

        result = search_service._arrange_presign_url_result(
            result_metadata, ["a", "missing"]
        )

        assert [item["video_id"] for item in result] == ["a"]

    def test_returns_empty_list_when_no_ids_match(self, search_service):
        result = search_service._arrange_presign_url_result([], ["a", "b"])

        assert result == []

    def test_replaces_thumbnail_url_with_presigned_url(self, search_service, s3_client):
        result_metadata = [make_metadata("a", thumbnail_path="videos/a/thumb.jpg")]

        result = search_service._arrange_presign_url_result(result_metadata, ["a"])

        s3_client.generate_public_resource_url.assert_called_once_with("videos/a/thumb.jpg")
        assert (
            result[0]["thumbnail_url"]
            == "https://cdn.example.test/videos/a/thumb.jpg"
        )

    def test_preserves_other_metadata_fields(self, search_service):
        result_metadata = [make_metadata("a")]

        result = search_service._arrange_presign_url_result(result_metadata, ["a"])

        assert result[0]["title"] == "title-a"
        assert result[0]["view"] == 1


class TestGetMetadataGrpc:
    async def test_returns_empty_list_when_grpc_response_is_none(
        self, search_service, grpc_service
    ):
        grpc_service.get_video_metadata.return_value = None

        result = await search_service.get_metadata_grpc(["a", "b"])

        assert result == []

    async def test_maps_grpc_items_into_metadata_dicts(
        self, search_service, grpc_service
    ):
        grpc_service.get_video_metadata.return_value = [FakeGrpcMetadataItem("a")]

        result = await search_service.get_metadata_grpc(["a"])

        assert result == [
            {
                "video_id": "a",
                "title": "title-a",
                "description": "desc-a",
                "thumbnail_url": "thumb-a",
                "view": 10,
                "date": 42,
                "channel": "chan",
            }
        ]

    async def test_returns_empty_list_for_empty_grpc_response(
        self, search_service, grpc_service
    ):
        grpc_service.get_video_metadata.return_value = []

        result = await search_service.get_metadata_grpc([])

        assert result == []

    async def test_clears_inflight_event_after_success(
        self, search_service, grpc_service
    ):
        search_service._inflight_requests["a"] = asyncio.Event()

        await search_service.get_metadata_grpc(["a"])

        assert "a" not in search_service._inflight_requests

    async def test_sets_and_clears_inflight_event_even_when_grpc_raises(
        self, search_service, grpc_service
    ):
        event = asyncio.Event()
        search_service._inflight_requests["a"] = event
        grpc_service.get_video_metadata.side_effect = RuntimeError("grpc failure")

        with pytest.raises(RuntimeError):
            await search_service.get_metadata_grpc(["a"])

        assert event.is_set()
        assert "a" not in search_service._inflight_requests


class TestCacheSearchingResult:
    async def test_zadds_ids_with_positional_index_and_configured_expiry(
        self, search_service, redis_service
    ):
        await search_service._cache_searching_result(
            "user-1", "query", ["a", "b", "c"]
        )

        redis_service.zadd.assert_awaited_once_with(
            "search:user-1:query",
            {"a": 0, "b": 1, "c": 2},
            expire=config.SEARCH_CACHE_TTL,
        )
