from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import install_container_stub

install_container_stub()

from src.app.api.v1.endpoint.search import router as search_router  # noqa: E402
from src.core.dependency import get_current_user  # noqa: E402
import src.app.api.v1.endpoint.search as search_module  # noqa: E402


@pytest.fixture
def app():
    test_app = FastAPI()
    test_app.include_router(search_router, prefix="/api/v1")
    test_app.dependency_overrides[get_current_user] = lambda: "user-1"
    yield test_app
    test_app.dependency_overrides.clear()


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def mock_search_service(mocker):
    mock_service = AsyncMock()
    mocker.patch.object(search_module.container, "search_service", mock_service)
    return mock_service


class TestSearchEndpoint:
    def test_returns_search_results_with_next_cursor(self, client, mock_search_service):
        mock_search_service.search.return_value = (
            [
                {
                    "video_id": "a",
                    "title": "Title A",
                    "description": "Desc A",
                    "thumbnail_url": "https://cdn.example.test/a.jpg",
                    "view": 5,
                    "date": 1700000000,
                    "channel": "channel-a",
                }
            ],
            10,
        )

        response = client.get("/api/v1/search", params={"query": "cats"})

        assert response.status_code == 200
        body = response.json()
        assert body["cursor"] == 10
        assert body["data"][0]["video_id"] == "a"

    def test_returns_empty_data_and_null_cursor_when_no_matches(
        self, client, mock_search_service
    ):
        mock_search_service.search.return_value = ([], None)

        response = client.get("/api/v1/search", params={"query": "no-matches-anywhere"})

        assert response.status_code == 200
        assert response.json() == {"data": [], "cursor": None}

    def test_forwards_query_limit_and_cursor_to_service(
        self, client, mock_search_service
    ):
        mock_search_service.search.return_value = ([], None)

        client.get(
            "/api/v1/search", params={"query": "cats", "limit": 5, "cursor": 3}
        )

        mock_search_service.search.assert_awaited_once_with("user-1", "cats", 5, 3)

    def test_defaults_limit_to_ten_and_cursor_to_none(
        self, client, mock_search_service
    ):
        mock_search_service.search.return_value = ([], None)

        client.get("/api/v1/search", params={"query": "cats"})

        mock_search_service.search.assert_awaited_once_with("user-1", "cats", 10, None)

    def test_requires_query_parameter(self, client, mock_search_service):
        response = client.get("/api/v1/search")

        assert response.status_code == 422

    def test_returns_401_when_dependency_override_removed_and_no_token_given(self, app):
        app.dependency_overrides.clear()
        client = TestClient(app)

        response = client.get("/api/v1/search", params={"query": "cats"})

        assert response.status_code in (401, 403)
