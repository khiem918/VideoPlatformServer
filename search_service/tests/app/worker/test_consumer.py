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

<<<<<<< HEAD
            fake_video_service.process_metadata.assert_called_once_with(
                "video-1", "A Title", "A description", user_id=None, visibility=None
            )
        finally:
            await verify_connection.close()
            await consumer_connection.close()
=======
    async def test_handles_missing_desc_field_gracefully(self, fake_video_service):
        message = make_incoming_message(
            {
                "correlationId": "corr-1",
                "videoId": "video-1",
                "title": "A Title",
            }
        )
        exchange = make_exchange()
>>>>>>> parent of 2247c5d (Merge pull request #5 from khiem918/feat/aws-integration)

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

<<<<<<< HEAD
            response_message = await wait_for_message(response_queue)
            async with response_message.process():
                pass

            fake_video_service.process_metadata.assert_called_once_with(
                "video-1", "A Title", None, user_id=None, visibility=None
            )
        finally:
            await verify_connection.close()
            await consumer_connection.close()

    async def test_publishes_encoded_response_after_processing(
        self, fake_video_service, rabbitmq_url
    ):
        """
        Regression test for the fix to the previous bug where the response
        body was passed to aio_pika.Message as a str instead of bytes,
        raising TypeError. Publishing a real message through the real broker
        exercises consumer.py's actual `.encode("utf-8")` call: if that fix
        regressed, `exchange.publish` inside the handler would raise and no
        response message would ever reach this queue.
        """
        consumer_connection = await start_consumer()
        verify_connection = await aio_pika.connect_robust(rabbitmq_url)
        try:
            verify_channel = await verify_connection.channel()
            exchange = await verify_channel.get_exchange(EXCHANGE)
            response_queue = await verify_channel.get_queue(RESPONSE_QUEUE)
            await response_queue.purge()

            await exchange.publish(
                aio_pika.Message(
                    json.dumps(
                        {
                            "correlationId": "corr-42",
                            "videoId": "video-1",
                            "title": "A Title",
                            "desc": None,
                        }
                    ).encode("utf-8")
                ),
                routing_key="video.metadata.trans",
            )

            response_message = await wait_for_message(response_queue)
            async with response_message.process():
                assert isinstance(response_message.body, bytes)
                assert json.loads(response_message.body.decode()) == {
                    "correlationId": "corr-42",
                    "status": "succeeded",
                }
        finally:
            await verify_connection.close()
            await consumer_connection.close()
=======
        exchange.publish.assert_not_awaited()
>>>>>>> parent of 2247c5d (Merge pull request #5 from khiem918/feat/aws-integration)
