import time

import pytest
from jose import jwt

from src.core.config import config
from src.core.dependency import get_current_user
from src.core.security import UnauthorizedException

TEST_SECRET = "unit-test-fake-secret-do-not-use"  # noqa: S105


def make_token(secret=TEST_SECRET, **overrides):
    now = int(time.time())
    payload = {"userId": "user-1", "iat": now, "exp": now + 3600, **overrides}
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest.fixture(autouse=True)
def patch_jwt_secret(mocker):
    mocker.patch.object(config, "JWT_SECRET", TEST_SECRET)


class TestGetCurrentUser:
    def test_returns_user_id_from_valid_token(self):
        token = make_token(userId="user-99")

        result = get_current_user(token=token)

        assert result == "user-99"

    def test_raises_unauthorized_for_token_with_wrong_secret(self):
        token = make_token(secret="a-different-fake-secret")

        with pytest.raises(UnauthorizedException):
            get_current_user(token=token)

    def test_raises_unauthorized_for_malformed_token(self):
        with pytest.raises(UnauthorizedException):
            get_current_user(token="not-a-real-jwt")

    def test_raises_unauthorized_when_payload_missing_required_fields(self):
        now = int(time.time())
        token = jwt.encode({"iat": now, "exp": now + 3600}, TEST_SECRET, algorithm="HS256")

        with pytest.raises(UnauthorizedException):
            get_current_user(token=token)

    def test_error_detail_does_not_leak_internal_information(self):
        with pytest.raises(UnauthorizedException) as exc_info:
            get_current_user(token="garbage")

        assert exc_info.value.detail == "Could not validate credentials"
