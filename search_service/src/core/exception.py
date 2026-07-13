from typing import Any, Dict, Optional

from fastapi import HTTPException, status

class UnauthorizedException(HTTPException):
    def __init__(self, detail: str = None, header : Optional[Dict[str, Any]] = None) -> None:
        super().__init__(status.HTTP_401_UNAUTHORIZED, detail=detail, headers=header)

class ForbiddenException(HTTPException):
    def __init__(self, detail: str = None, header : Optional[Dict[str, Any]] = None) -> None:
        super().__init__(status.HTTP_403_FORBIDDEN, detail=detail, headers=header)
