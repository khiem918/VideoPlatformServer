from unittest.mock import MagicMock

import pytest

from src.infrastructure.s3 import s3_client as s3_client_module
from src.infrastructure.s3.s3_client import S3Client


@pytest.fixture
def boto_client(mocker):
    fake_client = MagicMock()
    mocker.patch.object(s3_client_module.boto3, "client", return_value=fake_client)
    return fake_client


class TestS3ClientConstruction:
    def test_creates_boto_client_with_configured_credentials(self, mocker, boto_client):
        mocker.patch.object(s3_client_module.app_config, "S3_ENDPOINT", "https://s3.test")
        mocker.patch.object(s3_client_module.app_config, "S3_ACCESS_KEY", "fake-access-key")
        mocker.patch.object(s3_client_module.app_config, "S3_SECRET_KEY", "fake-secret-key")
        mocker.patch.object(s3_client_module.app_config, "S3_REGION", "us-east-1")
        mocker.patch.object(s3_client_module.app_config, "S3_BUCKET", "test-bucket")

        S3Client()

        _, kwargs = s3_client_module.boto3.client.call_args
        assert kwargs["endpoint_url"] == "https://s3.test"
        assert kwargs["aws_access_key_id"] == "fake-access-key"
        assert kwargs["aws_secret_access_key"] == "fake-secret-key"
        assert kwargs["region_name"] == "us-east-1"


class TestGetPresignedUrl:
    def test_returns_presigned_url_for_configured_bucket(self, mocker, boto_client):
        mocker.patch.object(s3_client_module.app_config, "S3_BUCKET", "test-bucket")
        boto_client.generate_presigned_url.return_value = "https://signed.example.test/x"

        client = S3Client()
        result = client.get_presigned_url("videos/a/thumb.jpg")

        assert result == "https://signed.example.test/x"
        boto_client.generate_presigned_url.assert_called_once_with(
            "get_object",
            Params={"Bucket": "test-bucket", "Key": "videos/a/thumb.jpg"},
            ExpiresIn=3600,
        )

    def test_forwards_custom_expiration(self, mocker, boto_client):
        mocker.patch.object(s3_client_module.app_config, "S3_BUCKET", "test-bucket")
        boto_client.generate_presigned_url.return_value = "https://signed.example.test/x"

        client = S3Client()
        client.get_presigned_url("videos/a/thumb.jpg", expiration=120)

        _, kwargs = boto_client.generate_presigned_url.call_args
        assert kwargs["ExpiresIn"] == 120
