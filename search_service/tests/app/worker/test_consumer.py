from unittest.mock import AsyncMock, MagicMock
import json
import pytest

from tests.app.worker.conftest import make_exchange, make_incoming_message
from tests.conftest import install_container_stub

install_container_stub()

from src.app.worker import consumer as consumer_module  # noqa: E402
from src.app.worker.consumer import handle_metadata_transfer_message  # noqa: E402


@pytest.fixture(autouse=True)
def fake_video_service(mocker):
    fake_video = AsyncMock()
    mocker.patch.object(consumer_module.container, "video", fake_video)
    return fake_video


class TestHandleMetadataTransferMessage:
    async def test_processes_metadata_with_parsed_payload_fields(
        self, fake_video_service
    ):
        message = make_incoming_message(
            {
                "correlationId": "corr-1",
                "videoId": "video-1",
                "title": "A Title",
                "description": "A description",  # Sử dụng chuẩn tên description từ NestJS
                "userId": "user-1",
                "visibility": "PUBLIC",
            }
        )
        exchange = make_exchange()
        exchange.publish = AsyncMock()

        await handle_metadata_transfer_message(message, exchange)

        fake_video_service.process_metadata.assert_awaited_once_with(
            "video-1", 
            "A Title", 
            "A description", 
            user_id="user-1", 
            visibility="PUBLIC"
        )

    async def test_handles_missing_desc_and_privacy_fields_gracefully(
        self, fake_video_service
    ):
        """
        Kiểm tra khả năng tương thích ngược khi payload thiếu description, userId hoặc visibility.
        """
        message = make_incoming_message(
            {
                "correlationId": "corr-1",
                "videoId": "video-1",
                "title": "A Title",
            }
        )
        exchange = make_exchange()
        exchange.publish = AsyncMock()

        await handle_metadata_transfer_message(message, exchange)

        fake_video_service.process_metadata.assert_awaited_once_with(
            "video-1", 
            "A Title", 
            None, 
            user_id=None, 
            visibility="PUBLIC"
        )

    async def test_publishes_encoded_bytes_response_after_processing(
        self, fake_video_service
    ):
        message = make_incoming_message(
            {
                "correlationId": "corr-42",
                "videoId": "video-1",
                "title": "A Title",
            }
        )
        exchange = make_exchange()
        exchange.publish = AsyncMock()

        await handle_metadata_transfer_message(message, exchange)

        # Kiểm tra lệnh exchange.publish đã được gọi
        assert exchange.publish.await_count == 1
        
        # Bóc tách tin nhắn phản hồi được gửi đi
        published_message = exchange.publish.call_args[0][0]
        routing_key = exchange.publish.call_args[1].get("routing_key") or exchange.publish.call_args[0][1]

        assert routing_key == "video.metadata.res"
        assert isinstance(published_message.body, bytes)
        assert json.loads(published_message.body.decode("utf-8")) == {
            "correlationId": "corr-42",
            "status": "succeeded",
        }