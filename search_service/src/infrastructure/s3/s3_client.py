import os
import boto3
from botocore.config import Config 
import asyncio

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
    
    async def download_file(self, r2_path: str, local_path: str) -> None:
        """
        Download file từ Cloudflare R2 về đường dẫn local.
        boto3 download_file là blocking → chạy trong thread pool
        để không block event loop async.

        Args:
            r2_path:    đường dẫn file trên R2 (giá trị từ job.r2Path)
            local_path: đường dẫn local để lưu file về
        """
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self._client.download_file(self._bucket, r2_path, local_path),
        )