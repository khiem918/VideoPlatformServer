from functools import lru_cache
import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    DATABASE_URL: str = os.getenv("DATABASE_URL")
    
    
    JWT_SECRET: str = os.getenv("JWT_SECRET")

    
    QDRANT_URL: str = os.getenv("QDRANT_URL")
    
    
    REDIS_URL: str = os.getenv("REDIS_URL")
    
    
    MQ_URL: str = os.getenv("MQ_URL")
    
    
    GRPC_URL: str = os.getenv("GRPC_URL")
    

    S3_ENDPOINT: str | None = os.getenv("S3_ENDPOINT")
    S3_ACCESS_KEY: str | None = os.getenv("S3_ACCESS_KEY")
    S3_SECRET_KEY: str | None = os.getenv("S3_SECRET_KEY")
    S3_REGION: str | None = os.getenv("S3_REGION")
    S3_BUCKET: str | None = os.getenv("S3_BUCKET")


    META_CACHE_TTL: int = 3600 # 1 hour
    SEARCH_CACHE_TTL: int = 600 # 10 minutes 
    MAX_SEARCH_RESULTS: int = 40

    CORS_ORIGINS: list[str] = ["*"]

    CLOUDFRONT_DOMAIN_NAME: str = os.getenv("CLOUDFRONT_DOMAIN_NAME")



    
@lru_cache
def get_config() -> Config:
    return Config()


config = get_config()
