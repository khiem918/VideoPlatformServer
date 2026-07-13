import os
import boto3
from botocore.config import Config 
import asyncio

class S3Client:     
    def __init__(self):
        endpoint =  ""
        access_key = ""
        secret_key = ""
        region = ""
        self._bucket = "video-streaming-platform"

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
    
    async def download_object(self, r2_path: str, local_path: str) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            self._client.download_file,
            self._bucket,
            r2_path,
            local_path,
        )
        
    async def upload_object(self, local_path: str, r2_path: str) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            self._client.upload_file,
            local_path,
            self._bucket,
            r2_path,
        )


if __name__ == "__main__":
    s3_client = S3Client()

    try: 
        asyncio.run(s3_client.upload_object("/home/khiem918/Downloads/3 Minutes of Oppenheimer in 4K _ IMAX_2160p.mp4", "video/32433333/test.mp4"))
        print("Upload successful")

    except Exception as e:
        print(f"Upload failed: {e}")