import os
import boto3
from botocore.config import Config 


class S3Client:     
    def __init__(self):
        endpoint = os.getenv("S3_ENDPOINT")
        access_key = os.getenv("S3_ACCESS_KEY")
        secret_key = os.getenv("S3_SECRET_KEY")
        region = os.getenv("S3_REGION")
        self._bucket = os.getenv("S3_BUCKET")

        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,           
            aws_secret_access_key=secret_key,
            region_name=region,
            config=Config(signature_version="s3v4")
        )   

    def get_presigned_url(self, path: str, expiration: int = 3600) -> str:
        url = self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": path},
            ExpiresIn=expiration,
        )
        return url