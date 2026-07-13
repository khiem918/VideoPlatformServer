from unittest.mock import AsyncMock, MagicMock

import grpc
import pytest

from src.infrastructure.grpc import grpc_client as grpc_client_module
from src.infrastructure.grpc.grpc_client import GrpcClient


class TestConnect:
    async def test_creates_channel_and_stub(self, mocker):
        fake_channel = MagicMock()
        mocker.patch.object(
            grpc_client_module.grpc.aio, "insecure_channel", return_value=fake_channel
        )
        stub_cls = mocker.patch.object(grpc_client_module.pb_grpc, "VideoMetaDataServiceStub")

        client = GrpcClient()
        await client.connect()

        stub_cls.assert_called_once_with(fake_channel)
        assert client._channel is fake_channel


class TestClose:
    async def test_closes_channel_when_connected(self):
        client = GrpcClient()
        client._channel = AsyncMock()

        await client.close()

        client._channel.close.assert_awaited_once()

    async def test_does_nothing_when_never_connected(self):
        client = GrpcClient()

        await client.close()


class TestGetVideoMetadata:
    async def test_raises_assertion_error_when_not_connected(self):
        client = GrpcClient()

        with pytest.raises(AssertionError, match="not connected"):
            await client.get_video_metadata(["a"])

    async def test_returns_metadata_from_stub_response(self):
        client = GrpcClient()
        client._stub = AsyncMock()
        response = MagicMock()
        response.video_metadata = ["fake-item"]
        client._stub.GetVideoMetaData = AsyncMock(return_value=response)

        result = await client.get_video_metadata(["a"])

        assert result == ["fake-item"]

    async def test_returns_none_when_server_reports_not_found(self):
        client = GrpcClient()
        client._stub = AsyncMock()

        error = grpc.aio.AioRpcError(
            grpc.StatusCode.NOT_FOUND,
            initial_metadata=grpc.aio.Metadata(),
            trailing_metadata=grpc.aio.Metadata(),
        )
        client._stub.GetVideoMetaData = AsyncMock(side_effect=error)

        result = await client.get_video_metadata(["missing"])

        assert result is None

    async def test_reraises_non_not_found_grpc_errors(self):
        client = GrpcClient()
        client._stub = AsyncMock()

        error = grpc.aio.AioRpcError(
            grpc.StatusCode.INTERNAL,
            initial_metadata=grpc.aio.Metadata(),
            trailing_metadata=grpc.aio.Metadata(),
        )
        client._stub.GetVideoMetaData = AsyncMock(side_effect=error)

        with pytest.raises(grpc.aio.AioRpcError):
            await client.get_video_metadata(["a"])
