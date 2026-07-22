import asyncio
import os
import sys

import boto3
from botocore.config import Config

# Allow running this module as a script by adding the package root to `sys.path`
try:
    from src.core.config import config
except ModuleNotFoundError:
    base_dir = os.path.normpath(
        os.path.join(os.path.dirname(__file__), "../../..")
    )
    if base_dir not in sys.path:
        sys.path.insert(0, base_dir)
    from src.core.config import config


class S3Client:
    def __init__(self):
        access_key = config.S3_ACCESS_KEY
        secret_key = config.S3_SECRET_KEY
        region = config.S3_REGION
        self._bucket = config.S3_BUCKET
        self._endpoint_url = config.CLOUDFRONT_DOMAIN_NAME

        self._client = boto3.client(
            "s3",
            aws_access_key_id=access_key,           
            aws_secret_access_key=secret_key,
            region_name=region,
            config=Config(signature_version="s3v4")
        )   
    
    def generate_public_resource_url(self, path: str) -> str:
        return f"https://{self._endpoint_url}/public/{path}"



