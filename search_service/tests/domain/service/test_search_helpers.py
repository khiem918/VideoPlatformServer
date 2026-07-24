from unittest.mock import AsyncMock, MagicMock
import pytest
from tests.domain.service.conftest import make_metadata


def make_chunk_result(video_id, score, owner_id="user-1", text="matched text"):
    chunk = MagicMock()
    chunk.score = score
    chunk.payload = {
        "videoId": video_id,
        "userOwner": owner_id,
        "start": 0,
        "end": 10,
        "text": text,
    }
    return chunk


class TestSearchFullQuery:
    async def test_embeds_query_and_searches_chunk_qdrant(
        self, search_service, embedding_service, chunk_qdrant_service, redis_service
    ):
        # Giả lập cache có sẵn metadata hợp lệ
        meta_a = make_metadata("a")
        meta_a["visibility"] = "PUBLIC"
        redis_service.mget_with_ttl.return_value = [
            {"key": "meta:a", "value": meta_a, "ttl": 3600}
        ]

        chunk_qdrant_service.search_chunks.return_value = [
            make_chunk_result("a", 0.95)
        ]

        results, next_cursor = await search_service.search("user-1", "test query")

        # Xác nhận chỉ gọi embed_query (Dense-Only), không gọi embed_sparse
        embedding_service.embed_query.assert_awaited_once_with("test query")
        assert chunk_qdrant_service.search_chunks.await_count == 1
        assert len(results) == 1
        assert results[0]["video_id"] == "a"
        assert results[0]["score"] == 0.95
        assert next_cursor is None

    async def test_filters_out_private_videos_of_other_users(
        self, search_service, chunk_qdrant_service, redis_service
    ):
        meta_public = make_metadata("pub")
        meta_public["visibility"] = "PUBLIC"

        meta_private_other = make_metadata("priv_other")
        meta_private_other["visibility"] = "PRIVATE"

        redis_service.mget_with_ttl.return_value = [
            {"key": "meta:pub", "value": meta_public, "ttl": 3600},
            {"key": "meta:priv_other", "value": meta_private_other, "ttl": 3600},
        ]

        # Trả về 2 chunk từ Qdrant đều của người dùng khác (owner_id="other-user")
        chunk_qdrant_service.search_chunks.return_value = [
            make_chunk_result("pub", 0.9, owner_id="other-user"),
            make_chunk_result("priv_other", 0.8, owner_id="other-user"),
        ]

        results, _ = await search_service.search("user-1", "query")

        # Xác nhận video PRIVATE của người khác bị loại bỏ, chỉ giữ lại video PUBLIC
        assert len(results) == 1
        assert results[0]["video_id"] == "pub"

    async def test_pagination_returns_correct_cursor(
        self, search_service, chunk_qdrant_service, redis_service
    ):
        metas = [make_metadata(str(i)) for i in range(3)]
        for m in metas:
            m["visibility"] = "PUBLIC"

        redis_service.mget_with_ttl.return_value = [
            {"key": f"meta:{i}", "value": metas[i], "ttl": 3600} for i in range(3)
        ]

        chunk_qdrant_service.search_chunks.return_value = [
            make_chunk_result("0", 0.9),
            make_chunk_result("1", 0.8),
            make_chunk_result("2", 0.7),
        ]

        # Yêu cầu limit=2, bắt đầu từ cursor=0
        results, next_cursor = await search_service.search(
            "user-1", "query", limit=2, cursor=0
        )

        assert len(results) == 2
        assert results[0]["video_id"] == "0"
        assert results[1]["video_id"] == "1"
        assert next_cursor == 2

    async def test_raises_exception_when_embedding_fails(
        self, search_service, embedding_service
    ):
        embedding_service.embed_query.side_effect = Exception("embedding error")

        with pytest.raises(Exception, match="Error occurred while embedding query"):
            await search_service.search("user-1", "query")