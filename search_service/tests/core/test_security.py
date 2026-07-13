import time

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from src.core.config import config
from src.core.security import JWTBearer, decodeJWT

TEST_SECRET = "unit-test-fake-secret-do-not-use"  # noqa: S105


def make_token(secret=TEST_SECRET, **overrides):
    now = int(time.time())
    payload = {"userId": "user-1", "iat": now, "exp": now + 3600, **overrides}
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture(autouse=True)
def patch_jwt_secret(mocker):
    mocker.patch.object(config, "JWT_SECRET", TEST_SECRET)


class TestDecodeJwt:
    def test_returns_payload_for_valid_token(self):
        token = make_token(userId="user-42")

        payload = decodeJWT(token)

        assert payload["userId"] == "user-42"

    def test_returns_none_for_expired_token(self):
        now = int(time.time())
        token = make_token(iat=now - 7200, exp=now - 3600)

        assert decodeJWT(token) is None

    def test_returns_none_for_token_signed_with_wrong_secret(self):
        token = make_token(secret="a-completely-different-fake-secret")

        assert decodeJWT(token) is None

    def test_returns_none_for_malformed_token(self):
        assert decodeJWT("not-a-real-jwt") is None

    def test_returns_none_for_empty_token(self):
        assert decodeJWT("") is None


@pytest.fixture
def bearer_app():
    app = FastAPI()

    @app.get("/protected")
    async def protected(token: str = Depends(JWTBearer())):
        return {"token": token}

    return app


@pytest.fixture
def client(bearer_app):
    return TestClient(bearer_app)


class TestJwtBearer:
    def test_returns_raw_token_when_valid(self, client):
        token = make_token()

        response = client.get(
            "/protected", headers={"Authorization": f"Bearer {token}"}
        )

        assert response.status_code == 200
        assert response.json()["token"] == token

    def test_rejects_request_with_no_authorization_header(self, client):
        response = client.get("/protected")

        assert response.status_code in (401, 403)

    def test_rejects_non_bearer_scheme_via_fastapis_base_httpbearer_check(
        self, client
    ):
        token = make_token()

        response = client.get(
            "/protected", headers={"Authorization": f"Basic {token}"}
        )

        assert response.status_code == 403
        assert response.json()["detail"] == "Invalid authentication credentials"

    def test_rejects_lowercase_bearer_scheme_due_to_case_sensitive_check(self, client):
        token = make_token()

        response = client.get(
            "/protected", headers={"Authorization": f"bearer {token}"}
        )

        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid authentication scheme."

    def test_rejects_invalid_or_expired_token(self, client):
        response = client.get(
            "/protected", headers={"Authorization": "Bearer not-a-real-jwt"}
        )

        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid token or expired token."
