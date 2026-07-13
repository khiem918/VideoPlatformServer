import importlib
import sys
import types
from unittest.mock import AsyncMock, MagicMock

import pytest


def install_container_stub() -> MagicMock:
    existing = sys.modules.get("src.app.container")
    if existing is not None and hasattr(existing, "container"):
        return existing.container

    stub_container = MagicMock(name="container")
    stub_container.search_service = AsyncMock(name="search_service")
    stub_container.video = AsyncMock(name="video")
    stub_container.embedding = MagicMock(name="embedding")
    stub_container.qdrant = AsyncMock(name="qdrant")
    stub_container.postgres = AsyncMock(name="postgres")
    stub_container.redis_service = AsyncMock(name="redis_service")
    stub_container.grpc_client = AsyncMock(name="grpc_client")
    stub_container.s3_client = MagicMock(name="s3_client")
    stub_container.grpc_server = AsyncMock(name="grpc_server")

    stub_module = types.ModuleType("src.app.container")
    stub_module.container = stub_container
    stub_module.Container = MagicMock(name="Container")
    sys.modules["src.app.container"] = stub_module

    app_pkg = importlib.import_module("src.app")
    app_pkg.container = stub_module

    return stub_container


@pytest.fixture
def mock_container():
    stub_container = install_container_stub()
    stub_container.reset_mock(side_effect=False, return_value=False)
    stub_container.search_service = AsyncMock(name="search_service")
    stub_container.video = AsyncMock(name="video")
    yield stub_container
