from unittest.mock import AsyncMock, MagicMock
import pytest
from tests.domain.service.conftest import make_metadata


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

        s3_client.get_presigned_url.assert_called_once_with("videos/a/thumb.jpg")
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
        result = await search_service.get_metadata_grpc(["video-1", "video-2"])
        assert result == []