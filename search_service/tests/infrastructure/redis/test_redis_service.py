import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.infrastructure.redis import redis as redis_module
from src.infrastructure.redis.redis import RedisService


@pytest.fixture
def service(mocker):
    mocker.patch.object(redis_module.Redis, "from_url", return_value=MagicMock())
    instance = RedisService()
    instance._client = MagicMock()
    return instance


class TestSet:
    async def test_serializes_value_as_json_with_expiry(self, service):
        service._client.set = AsyncMock()

        await service.set("key-1", {"a": 1}, expire=120)

        service._client.set.assert_awaited_once_with(
            "key-1", json.dumps({"a": 1}), ex=120
        )


class TestGet:
    async def test_returns_deserialized_value_when_present(self, service):
        service._client.get = AsyncMock(return_value=json.dumps({"a": 1}))

        result = await service.get("key-1")

        assert result == {"a": 1}

    async def test_returns_none_when_key_missing(self, service):
        service._client.get = AsyncMock(return_value=None)

        result = await service.get("missing-key")

        assert result is None


class TestDelete:
    async def test_calls_client_delete_with_key(self, service):
        service._client.delete = AsyncMock()

        await service.delete("key-1")

        service._client.delete.assert_awaited_once_with("key-1")


class TestMgetWithTtl:
    async def test_zips_keys_values_and_ttls_together(self, service):
        pipeline = MagicMock()
        pipeline.execute = AsyncMock(
            return_value=[[json.dumps({"a": 1}), None], 500, -2]
        )
        service._client.pipeline.return_value = pipeline

        result = await service.mget_with_ttl(["meta:a", "meta:b"])

        assert result == [
            {"key": "meta:a", "value": {"a": 1}, "ttl": 500},
            {"key": "meta:b", "value": None, "ttl": -2},
        ]

    async def test_returns_empty_list_for_empty_keys(self, service):
        pipeline = MagicMock()
        pipeline.execute = AsyncMock(return_value=[[], []])
        service._client.pipeline.return_value = pipeline

        result = await service.mget_with_ttl([])

        assert result == []


class TestMset:
    async def test_sets_each_key_value_pair_with_expiry(self, service):
        pipeline = MagicMock()
        pipeline.execute = AsyncMock()
        service._client.pipeline.return_value = pipeline

        await service.mset([("key-1", {"a": 1}), ("key-2", {"b": 2})], expire=60)

        pipeline.set.assert_any_call("key-1", json.dumps({"a": 1}), ex=60)
        pipeline.set.assert_any_call("key-2", json.dumps({"b": 2}), ex=60)
        pipeline.execute.assert_awaited_once()


class TestZadd:
    async def test_adds_members_and_sets_expiry(self, service):
        pipeline = MagicMock()
        pipeline.execute = AsyncMock()
        service._client.pipeline.return_value = pipeline

        await service.zadd("search:key", {"a": 0, "b": 1}, expire=300)

        pipeline.zadd.assert_called_once_with("search:key", {"a": 0, "b": 1})
        pipeline.expire.assert_called_once_with("search:key", 300)
        pipeline.execute.assert_awaited_once()


class TestZrange:
    async def test_returns_members_when_present(self, service):
        service._client.zrange = AsyncMock(return_value=["a", "b"])

        result = await service.zrange("search:key", 0, 9)

        assert result == ["a", "b"]

    async def test_returns_none_when_range_is_empty(self, service):
        service._client.zrange = AsyncMock(return_value=[])

        result = await service.zrange("search:key", 0, 9)

        assert result is None


class TestDeleteByPatternBug:
    async def test_bug_raises_type_error_because_scan_iter_needs_async_for(
        self, service
    ):
        async def fake_scan_iter(match=None, count=None):
            yield "meta:a"
            yield "meta:b"

        service._client.scan_iter = fake_scan_iter
        service._client.pipeline.return_value = MagicMock()

        with pytest.raises(TypeError, match="async_generator"):
            await service.delete_by_pattern(["meta:*"])
