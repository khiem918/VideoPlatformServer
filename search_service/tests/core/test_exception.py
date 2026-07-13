from fastapi import status

from src.core.exception import ForbiddenException, UnauthorizedException


class TestUnauthorizedException:
    def test_uses_401_status_code(self):
        exc = UnauthorizedException(detail="no token")

        assert exc.status_code == status.HTTP_401_UNAUTHORIZED
        assert exc.detail == "no token"

    def test_accepts_optional_headers(self):
        exc = UnauthorizedException(detail="no token", header={"WWW-Authenticate": "Bearer"})

        assert exc.headers == {"WWW-Authenticate": "Bearer"}


class TestForbiddenException:
    def test_uses_403_status_code(self):
        exc = ForbiddenException(detail="not allowed")

        assert exc.status_code == status.HTTP_403_FORBIDDEN
        assert exc.detail == "not allowed"
