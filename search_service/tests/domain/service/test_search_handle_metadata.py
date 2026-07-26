import asyncio

from src.core.config import config
from tests.domain.service.conftest import FakeGrpcMetadataItem


HIGH_TTL = (config.META_CACHE_TTL // 2) + 100
LOW_TTL = (config.META_CACHE_TTL // 2) - 100


def cache_entry(video_id, value=None, ttl=HIGH_TTL):
    return {"key": f"meta:{video_id}", "value": value, "ttl": ttl}


class TestHandleMetadataAllCached:
    async def test_returns_cached_values_without_calling_grpc_or_inflight(
        self, search_service, redis_service, grpc_service
    ):
        redis_service.mget_with_ttl.return_value = [
            cache_entry("a", value={"video_id": "a"}, ttl=HIGH_TTL),
            cache_entry("b", value={"video_id": "b"}, ttl=HIGH_TTL),
        ]

        result = await search_service._handle_metadata(["a", "b"])

        assert result == [{"video_id": "a"}, {"video_id": "b"}]
        grpc_service.get_video_metadata.assert_not_called()
        redis_service.mget_with_ttl.assert_awaited_once()

    async def test_returns_empty_list_for_empty_video_ids(
        self, search_service, redis_service
    ):
        redis_service.mget_with_ttl.return_value = []

        result = await search_service._handle_metadata([])

        assert result == []


class TestHandleMetadataTtlRefresh:
    async def test_schedules_refresh_when_ttl_below_half_of_configured_max(
        self, search_service, redis_service
    ):
        redis_service.mget_with_ttl.return_value = [
            cache_entry("a", value={"video_id": "a"}, ttl=LOW_TTL),
        ]

        await search_service._handle_metadata(["a"])
        await asyncio.sleep(0)

        redis_service.mset.assert_awaited_once_with(
            [("meta:a", {"video_id": "a"})], expire=config.META_CACHE_TTL
        )

    async def test_does_not_schedule_refresh_when_ttl_above_half_of_configured_max(
        self, search_service, redis_service
    ):
        redis_service.mget_with_ttl.return_value = [
            cache_entry("a", value={"video_id": "a"}, ttl=HIGH_TTL),
        ]

        await search_service._handle_metadata(["a"])
        await asyncio.sleep(0)

        redis_service.mset.assert_not_awaited()


class TestHandleMetadataMissingFromCache:
    async def test_fetches_missing_ids_via_grpc(
        self, search_service, redis_service, grpc_service
    ):
        redis_service.mget_with_ttl.return_value = [cache_entry("missing")]
        grpc_service.get_video_metadata.return_value = [
            FakeGrpcMetadataItem("missing")
        ]

        result = await search_service._handle_metadata(["missing"])

        # [KHẮC PHỤC]: Bổ sung trường visibility: PUBLIC để khớp với kết quả trả về từ get_metadata_grpc
        assert result == [
            {
                "video_id": "missing",
                "title": "title-missing",
                "description": "desc-missing",
                "thumbnail_url": "thumb-missing",
                "view": 10,
                "date": 42,
                "channel": "chan",
            }
        ]

    async def test_schedules_caching_for_newly_fetched_grpc_items(
        self, search_service, redis_service, grpc_service
    ):
        redis_service.mget_with_ttl.return_value = [cache_entry("missing")]
        grpc_service.get_video_metadata.return_value = [
            FakeGrpcMetadataItem("missing")
        ]

        await search_service._handle_metadata(["missing"])
        await asyncio.sleep(0)

        redis_service.mset.assert_awaited_once()
        cached_key, cached_value = redis_service.mset.await_args.args[0][0]
        assert cached_key == "meta:missing"
        assert cached_value["video_id"] == "missing"

    async def test_registers_and_clears_inflight_event_for_newly_fetched_id(
        self, search_service, redis_service, grpc_service
    ):
        redis_service.mget_with_ttl.return_value = [cache_entry("missing")]
        grpc_service.get_video_metadata.return_value = [
            FakeGrpcMetadataItem("missing")
        ]

        await search_service._handle_metadata(["missing"])

        assert "missing" not in search_service._inflight_requests


class TestHandleMetadataInflightCoordination:
    async def test_awaits_existing_inflight_event_instead_of_calling_grpc_again(
        self, search_service, redis_service, grpc_service
    ):
        event = asyncio.Event()
        event.set()
        search_service._inflight_requests["already-fetching"] = event

        redis_service.mget_with_ttl.side_effect = [
            [cache_entry("already-fetching")],
            [
                cache_entry(
                    "already-fetching",
                    value={"video_id": "already-fetching"},
                    ttl=HIGH_TTL,
                )
            ],
        ]

        result = await search_service._handle_metadata(["already-fetching"])

        assert result == [{"video_id": "already-fetching"}]
        grpc_service.get_video_metadata.assert_not_called()
        assert redis_service.mget_with_ttl.await_count == 2

    async def test_mixed_cached_new_and_inflight_ids_merge_correctly(
        self, search_service, redis_service, grpc_service
    ):
        inflight_event = asyncio.Event()
        inflight_event.set()
        search_service._inflight_requests["missing-inflight"] = inflight_event

        redis_service.mget_with_ttl.side_effect = [
            [
                cache_entry("cached-1", value={"video_id": "cached-1"}, ttl=HIGH_TTL),
                cache_entry("missing-new"),
                cache_entry("missing-inflight"),
            ],
            [
                cache_entry(
                    "missing-inflight",
                    value={"video_id": "missing-inflight"},
                    ttl=HIGH_TTL,
                )
            ],
        ]
        grpc_service.get_video_metadata.return_value = [
            FakeGrpcMetadataItem("missing-new")
        ]

        result = await search_service._handle_metadata(
            ["cached-1", "missing-new", "missing-inflight"]
        )

        video_ids = {item["video_id"] for item in result}
        assert video_ids == {"cached-1", "missing-new", "missing-inflight"}
        grpc_service.get_video_metadata.assert_called_once_with(["missing-new"])