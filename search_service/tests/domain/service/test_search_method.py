import asyncio

import pytest

from src.core.config import config
from tests.domain.service.conftest import make_scored_point


class TestSearchWithCursor:
    async def test_returns_paginated_results_from_cache(
        self, search_service, redis_service
    ):
        redis_service.zrange.return_value = ["a", "b"]
        redis_service.mget_with_ttl.return_value = [
            {"key": "meta:a", "value": {"video_id": "a", "thumbnail_url": "a.jpg"}, "ttl": 100},
            {"key": "meta:b", "value": {"video_id": "b", "thumbnail_url": "b.jpg"}, "ttl": 100},
        ]

        results, next_cursor = await search_service.search(
            "user-1", "query", limit=2, cursor=0
        )

        assert [item["video_id"] for item in results] == ["a", "b"]
        assert next_cursor == 2

    async def test_uses_cursor_and_limit_to_compute_zrange_bounds(
        self, search_service, redis_service
    ):
        redis_service.zrange.return_value = None

        await search_service.search("user-1", "query", limit=10, cursor=5)

        redis_service.zrange.assert_awaited_once_with(
            "search:user-1:query", 5, 14
        )

    async def test_returns_empty_result_when_cache_expired(
        self, search_service, redis_service
    ):
        redis_service.zrange.return_value = None

        results, next_cursor = await search_service.search(
            "user-1", "query", limit=10, cursor=0
        )

        assert results == []
        assert next_cursor is None

    async def test_returns_empty_result_when_cached_ids_have_no_metadata(
        self, search_service, redis_service
    ):
        redis_service.zrange.return_value = ["a"]
        redis_service.mget_with_ttl.return_value = [
            {"key": "meta:a", "value": None, "ttl": -2}
        ]

        results, next_cursor = await search_service.search(
            "user-1", "query", limit=10, cursor=0
        )

        assert results == []
        assert next_cursor is None


class TestSearchFullQuery:
    async def test_embeds_normalized_query_and_searches_qdrant(
        self, search_service, embedding_service, qdrant_service
    ):
        qdrant_service.search_points.return_value = []

        await search_service.search("user-1", "Hello World!", limit=10, cursor=None)

        embedding_service.embed_query.assert_awaited_once_with("hello world")
        embedding_service.embed_sparse.assert_awaited_once_with("hello world")

    async def test_orders_results_by_descending_score(
        self, search_service, qdrant_service, redis_service
    ):
        qdrant_service.search_points.return_value = [
            make_scored_point("low", 0.2),
            make_scored_point("high", 0.9),
        ]
        redis_service.mget_with_ttl.return_value = [
            {"key": "meta:high", "value": {"video_id": "high", "thumbnail_url": "h.jpg"}, "ttl": 100},
            {"key": "meta:low", "value": {"video_id": "low", "thumbnail_url": "l.jpg"}, "ttl": 100},
        ]

        results, next_cursor = await search_service.search(
            "user-1", "query", limit=10, cursor=None
        )

        assert [item["video_id"] for item in results] == ["high", "low"]
        assert next_cursor == 10

    async def test_returns_empty_list_when_no_search_results(
        self, search_service, qdrant_service, redis_service
    ):
        qdrant_service.search_points.return_value = []
        redis_service.mget_with_ttl.return_value = []

        results, next_cursor = await search_service.search(
            "user-1", "query", limit=10, cursor=None
        )

        assert results == []
        assert next_cursor == 10

    async def test_schedules_caching_of_results_when_results_found(
        self, search_service, qdrant_service, redis_service
    ):
        qdrant_service.search_points.return_value = [make_scored_point("a", 0.5)]
        redis_service.mget_with_ttl.return_value = [
            {"key": "meta:a", "value": {"video_id": "a", "thumbnail_url": "a.jpg"}, "ttl": 100}
        ]

        await search_service.search("user-1", "query", limit=10, cursor=None)
        await asyncio.sleep(0)

        redis_service.zadd.assert_awaited_once_with(
            "search:user-1:query", {"a": 0}, expire=config.SEARCH_CACHE_TTL
        )

    async def test_does_not_schedule_caching_when_no_results_found(
        self, search_service, qdrant_service, redis_service
    ):
        qdrant_service.search_points.return_value = []
        redis_service.mget_with_ttl.return_value = []

        await search_service.search("user-1", "query", limit=10, cursor=None)
        await asyncio.sleep(0)

        redis_service.zadd.assert_not_awaited()

    async def test_raises_wrapped_exception_when_embedding_fails(
        self, search_service, embedding_service
    ):
        embedding_service.embed_query.side_effect = RuntimeError("embedding down")

        with pytest.raises(Exception, match="Error occurred while embedding query"):
            await search_service.search("user-1", "query", limit=10, cursor=None)

    async def test_raises_wrapped_exception_when_qdrant_search_fails(
        self, search_service, qdrant_service
    ):
        qdrant_service.search_points.side_effect = RuntimeError("qdrant down")

        with pytest.raises(Exception, match="Error occurred while searching points"):
            await search_service.search("user-1", "query", limit=10, cursor=None)
