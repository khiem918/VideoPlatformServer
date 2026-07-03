from pydantic import BaseModel

class Payload(BaseModel):
    userId: str
    iat: int
    exp: int