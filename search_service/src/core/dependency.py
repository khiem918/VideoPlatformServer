from src.core.security import JWTBearer
from fastapi import Depends
import os
from jose import jwt
from pydantic import ValidationError
from src.core.security import UnauthorizedException
from src.core.schema.auth_schema import Payload

def get_current_user(
    token : str = Depends(JWTBearer())
) -> str:
    try: 
        payload = jwt.decode(token, os.environ.get("JWT_SECRET"), algorithms=["HS256"])
        data = Payload(**payload)
    except (jwt.JWTError, ValidationError):
        raise UnauthorizedException(detail="Could not validate credentials")

    return data.userId
