from unittest.mock import AsyncMock, MagicMock
import pytest
from tests.domain.service.conftest import make_metadata


def make_chunk_result(video_id, score, owner_id="user-1", text="matched text", start=0, end=10):
    chunk = MagicMock()
    chunk.score = score
    chunk.payload = {
        "videoId": video_id,
        "userOwner": owner_id,
        "start": start,
        "end": end,
        "text": text,
    }
    return chunk


class TestSearchWithCursor:
    async def test_returns_paginated_results_and_next_cursor(
        self, search_service, chunk_qdrant_service, redis_service
    ):
        metas = [make_metadata(f"vid-{i}") for i in range(3)]
        for m in metas:
            m["visibility"] = "PUBLIC"

        redis_service.mget_with_ttl.return_value = [
            {"key": f"meta:vid-{i}", "value": metas[i], "ttl": 3600} for i in range(3)
        ]

        chunk_qdrant_service.search_chunks.return_value = [
            make_chunk_result("vid-0", 0.9),
            make_chunk_result("vid-1", 0.8),
            make_chunk_result("vid-2", 0.7),
        ]

        results, next_cursor = await search_service.search(
            "user-1", "query", limit=2, cursor=0
        )

        assert len(results) == 2
        assert [item["video_id"] for item in results] == ["vid-0", "vid-1"]
        assert next_cursor == 2

    async def test_returns_none_cursor_when_end_of_results_reached(
        self, search_service, chunk_qdrant_service, redis_service
    ):
        meta = make_metadata("vid-0")
        meta["visibility"] = "PUBLIC"
        redis_service.mget_with_ttl.return_value = [
            {"key": "meta:vid-0", "value": meta, "ttl": 3600}
        ]
        chunk_qdrant_service.search_chunks.return_value = [
            make_chunk_result("vid-0", 0.9)
        ]

        results, next_cursor = await search_service.search(
            "user-1", "query", limit=10, cursor=0
        )

        assert len(results) == 1
        assert next_cursor is None


class TestSearchFullQuery:
    async def test_embeds_normalized_query_and_searches_chunk_qdrant(
        self, search_service, embedding_service, chunk_qdrant_service, redis_service
    ):
        meta = make_metadata("a")
        meta["visibility"] = "PUBLIC"
        redis_service.mget_with_ttl.return_value = [
            {"key": "meta:a", "value": meta, "ttl": 3600}
        ]
        chunk_qdrant_service.search_chunks.return_value = [
            make_chunk_result("a", 0.95)
        ]

        results, next_cursor = await search_service.search("user-1", "Hello World!", limit=10, cursor=None)

        embedding_service.embed_query.assert_awaited_once_with("hello world")
        embedding_service.embed_sparse.assert_not_awaited()
        chunk_qdrant_service.search_chunks.assert_awaited_once()
        assert len(results) == 1
        assert results[0]["video_id"] == "a"
        assert results[0]["score"] == 0.95

    async def test_orders_results_by_descending_score(
        self, search_service, chunk_qdrant_service, redis_service
    ):
        meta_high = make_metadata("high")
        meta_high["visibility"] = "PUBLIC"
        meta_low = make_metadata("low")
        meta_low["visibility"] = "PUBLIC"

        redis_service.mget_with_ttl.return_value = [
            {"key": "meta:low", "value": meta_low, "ttl": 3600},
            {"key": "meta:high", "value": meta_high, "ttl": 3600},
        ]

        chunk_qdrant_service.search_chunks.return_value = [
            make_chunk_result("low", 0.2),
            make_chunk_result("high", 0.9),
        ]

        results, _ = await search_service.search("user-1", "query", limit=10, cursor=None)

        assert [item["video_id"] for item in results] == ["high", "low"]

    async def test_filters_out_private_videos_of_other_users(
        self, search_service, chunk_qdrant_service, redis_service
    ):
        meta_pub = make_metadata("pub")
        meta_pub["visibility"] = "PUBLIC"
        meta_priv = make_metadata("priv_other")
        meta_priv["visibility"] = "PRIVATE"

        redis_service.mget_with_ttl.return_value = [
            {"key": "meta:pub", "value": meta_pub, "ttl": 3600},
            {"key": "meta:priv_other", "value": meta_priv, "ttl": 3600},
        ]

        chunk_qdrant_service.search_chunks.return_value = [
            make_chunk_result("pub", 0.9, owner_id="other-user"),
            make_chunk_result("priv_other", 0.8, owner_id="other-user"),
        ]

        results, _ = await search_service.search("user-1", "query")

        assert len(results) == 1
        assert results[0]["video_id"] == "pub"

    async def test_returns_empty_list_when_no_search_results(
        self, search_service, chunk_qdrant_service, redis_service
    ):
        chunk_qdrant_service.search_chunks.return_value = []
        redis_service.mget_with_ttl.return_value = []

        results, next_cursor = await search_service.search("user-1", "query", limit=10, cursor=None)

        assert results == []
        assert next_cursor is None

    async def test_raises_wrapped_exception_when_embedding_fails(
        self, search_service, embedding_service
    ):
        embedding_service.embed_query.side_effect = RuntimeError("embedding down")

        with pytest.raises(Exception, match="Error occurred while embedding query"):
            await search_service.search("user-1", "query", limit=10, cursor=None)