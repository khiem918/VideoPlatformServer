import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import install_container_stub

install_container_stub()

from src.app.api.v1.endpoint.health import router as health_router  # noqa: E402


@pytest.fixture
def client():
    test_app = FastAPI()
    test_app.include_router(health_router, prefix="/api/v1")
    return TestClient(test_app)


class TestHealthEndpoint:
    def test_returns_200_with_ok_status(self, client):
        response = client.get("/api/v1/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
