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
        mocker.patch.object(s3_client_module.config, "S3_ACCESS_KEY", "fake-access-key")
        mocker.patch.object(s3_client_module.config, "S3_SECRET_KEY", "fake-secret-key")
        mocker.patch.object(s3_client_module.config, "S3_REGION", "us-east-1")
        mocker.patch.object(s3_client_module.config, "S3_BUCKET", "test-bucket")

        S3Client()

        _, kwargs = s3_client_module.boto3.client.call_args
        assert "endpoint_url" not in kwargs
        assert kwargs["aws_access_key_id"] == "fake-access-key"
        assert kwargs["aws_secret_access_key"] == "fake-secret-key"
        assert kwargs["region_name"] == "us-east-1"


class TestGeneratePublicResourceUrl:
    def test_builds_public_url_from_cloudfront_domain(self, mocker, boto_client):
        mocker.patch.object(
            s3_client_module.config, "CLOUDFRONT_DOMAIN_NAME", "cdn.example.com"
        )

        client = S3Client()
        result = client.generate_public_resource_url("videos/a/thumb.jpg")

        assert result == "https://cdn.example.com/public/videos/a/thumb.jpg"
