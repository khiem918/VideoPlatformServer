from unittest.mock import AsyncMock

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
                "desc": "A description",
            }
        )
        exchange = make_exchange()

        with pytest.raises(TypeError):
            await handle_metadata_transfer_message(message, exchange)

        fake_video_service.process_metadata.assert_awaited_once_with(
            "video-1", "A Title", "A description"
        )

    async def test_handles_missing_desc_field_gracefully(self, fake_video_service):
        message = make_incoming_message(
            {
                "correlationId": "corr-1",
                "videoId": "video-1",
                "title": "A Title",
            }
        )
        exchange = make_exchange()

        with pytest.raises(TypeError):
            await handle_metadata_transfer_message(message, exchange)

        fake_video_service.process_metadata.assert_awaited_once_with(
            "video-1", "A Title", None
        )

    async def test_bug_publish_raises_type_error_because_body_is_not_encoded_to_bytes(
        self, fake_video_service
    ):
        message = make_incoming_message(
            {
                "correlationId": "corr-42",
                "videoId": "video-1",
                "title": "A Title",
                "desc": None,
            }
        )
        exchange = make_exchange()

        with pytest.raises(TypeError, match="string argument without an encoding"):
            await handle_metadata_transfer_message(message, exchange)

        exchange.publish.assert_not_awaited()
