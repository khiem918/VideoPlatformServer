from unittest.mock import AsyncMock, MagicMock

import grpc
import pytest

from tests.conftest import install_container_stub

install_container_stub()

from src.infrastructure.grpc import grpc_server as grpc_server_module  # noqa: E402
from src.infrastructure.grpc.grpc_server import (  # noqa: E402
    DeleteVideoServicer,
    GrpcServer,
)


class TestGrpcServerConstruction:
    def test_init_does_not_raise(self):
        GrpcServer()


class TestDeleteVideoServicerBug:
    async def test_bug_container_name_resolves_to_module_not_instance(self):
        assert not hasattr(grpc_server_module.container, "video")

    async def test_bug_delete_raises_attribute_error_and_is_reported_as_internal_error(
        self, mocker
    ):
        servicer = DeleteVideoServicer()
        request = MagicMock(video_id="video-1")
        context = AsyncMock()
        context.abort = AsyncMock(side_effect=RuntimeError("aborted"))

        with pytest.raises(RuntimeError, match="aborted"):
            await servicer.GetDeleteVideo(request, context)

        context.abort.assert_awaited_once()
        assert context.abort.await_args.args[0] == grpc.StatusCode.INTERNAL


class TestDeleteVideoServicerLogicAssumingCorrectContainerReference:
    async def test_deletes_video_and_returns_success_status(self, mocker):
        fake_container = MagicMock()
        fake_container.video = AsyncMock()
        mocker.patch.object(grpc_server_module, "container", fake_container)

        servicer = DeleteVideoServicer()
        request = MagicMock(video_id="video-1")
        context = AsyncMock()

        response = await servicer.GetDeleteVideo(request, context)

        fake_container.video.delete_video.assert_awaited_once_with("video-1")
        assert response.status == grpc_server_module.pb.DELETE_VIDEO_STATUS_SUCCEEDED

    async def test_aborts_with_internal_error_when_delete_raises(self, mocker):
        fake_container = MagicMock()
        fake_container.video = AsyncMock()
        fake_container.video.delete_video.side_effect = RuntimeError("db down")
        mocker.patch.object(grpc_server_module, "container", fake_container)

        servicer = DeleteVideoServicer()
        request = MagicMock(video_id="video-1")
        context = AsyncMock()
        context.abort = AsyncMock(side_effect=RuntimeError("aborted"))

        with pytest.raises(RuntimeError):
            await servicer.GetDeleteVideo(request, context)

        context.abort.assert_awaited_once()
        assert context.abort.await_args.args[0] == grpc.StatusCode.INTERNAL


class TestDeleteVideoServicerValidation:
    async def test_aborts_with_invalid_argument_when_video_id_missing(self, mocker):
        servicer = DeleteVideoServicer()
        request = MagicMock(video_id="")
        context = AsyncMock()
        context.abort = AsyncMock(side_effect=RuntimeError("aborted"))

        with pytest.raises(RuntimeError):
            await servicer.GetDeleteVideo(request, context)

        context.abort.assert_awaited_once()
        assert context.abort.await_args.args[0] == grpc.StatusCode.INVALID_ARGUMENT


class TestGrpcServerLifecycle:
    def _make_server_bypassing_init(self):
        server = object.__new__(GrpcServer)
        server._server = None
        return server

    async def test_disconnect_does_nothing_when_never_connected(self):
        server = self._make_server_bypassing_init()

        await server.disconnect()

    async def test_disconnect_stops_server_with_grace_period(self):
        server = self._make_server_bypassing_init()
        server._server = AsyncMock()

        await server.disconnect()

        server._server.stop.assert_awaited_once_with(5.0)
