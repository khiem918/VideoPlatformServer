import asyncio
import boto3
from botocore.config import Config


from src.core.config import config


class S3Client:
    def __init__(self):
        access_key = config.S3_ACCESS_KEY
        secret_key = config.S3_SECRET_KEY
        region = config.S3_REGION or "us-east-1"
        self._bucket = config.S3_BUCKET
        self._endpoint_url = config.CLOUDFRONT_DOMAIN_NAME

        self._client = boto3.client(
            "s3",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            config=Config(signature_version="s3v4")
        )

    def get_presigned_url(self, path: str, expiration: int = 3600) -> str:
        """
        Tạo presigned URL để đọc object từ bucket (từ nhánh feat).
        """
        url = self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": path},
            ExpiresIn=expiration,
        )
        return url

    async def download_file(self, r2_path: str, local_path: str) -> None:
        """
        Download file từ Cloudflare R2/S3 về đường dẫn local (từ nhánh feat).
        boto3 download_file là blocking → chạy trong thread pool
        để không block event loop async.

        Args:
            r2_path:    đường dẫn file trên R2/S3 (giá trị từ job.r2Path/objectPath)
            local_path: đường dẫn local để lưu file về cho worker AI xử lý
        """
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self._client.download_file(self._bucket, r2_path, local_path),
        )

    def generate_public_resource_url(self, path: str) -> str:
        """
        Tạo public URL qua CDN/CloudFront (từ nhánh main).
        """
        return f"https://{self._endpoint_url}/public/{path}"