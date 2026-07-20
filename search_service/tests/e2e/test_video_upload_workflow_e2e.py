"""
E2E test for the "upload video workflow" -- search_service side of the
dataflow.

This is the search_service half of the two-part upload-workflow e2e suite;
the api_service half is
api_service/test/video-upload-workflow.e2e-spec.ts, which drives a real
S3/R2 upload of a real video file plus real ffmpeg transcoding, then calls
`updateVideo` and pins the exact wire-contract payload
PublisherService.transferVideoMetadata puts on the `video.processing`
exchange (routing key `video.metadata.trans`):
    { correlationId, videoId, title, description, hashtags }

This suite replays that same real payload shape directly onto the real
exchange (no mocking of RabbitMQ/Qdrant), pulls it back off the real
`video.metadata.transfer` queue, and drives the real
`handle_metadata_transfer_message` (src/app/worker/consumer.py) against a
real Qdrant instance via a real `Video` + `QdrantService` pair -- proving
the dataflow from api_service to search_service and asserting what actually
lands in Qdrant (data handling), not just that a message was delivered.

PREREQUISITES (live infrastructure required, no mocking of RabbitMQ/Qdrant):
    - RabbitMQ and Qdrant must be running, e.g. via `docker/dev.sh start`
      (uses docker/docker-compose.api-service.yml: RabbitMQ on :5672, Qdrant
      on :6333).
    - `search_service/.env` must point MQ_URL / QDRANT_URL at those services.
    - Run with:
      `venv/bin/python -m pytest tests/e2e/test_video_upload_workflow_e2e.py`

`asyncio_mode = "auto"` is configured in search_service/pyproject.toml, so
plain `async def test_...` methods are collected automatically -- see
tests/e2e/test_video_metadata_update_e2e.py for the same convention, which
this suite's fixtures are copied from to stay consistent with house style.

Data-handling assertion on bug #1 (observed, not fixed): api_service's
PublisherService publishes the key `description`
(api_service/src/rabbitmq/interface/transferdata.interface.ts), but
consumer.py:20 reads `payload.get('desc')`. This suite asserts the title
propagates into Qdrant while the description does not, matching current
production behavior -- see
tests/e2e/test_video_metadata_update_e2e.py::test_bug1_real_api_service_payload_shape_drops_description
for the original regression test this mirrors.
"""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock

import aio_pika
import pytest
from qdrant_client import AsyncQdrantClient
from qdrant_client.http.models import SparseVector

from tests.conftest import install_container_stub

install_container_stub()

from src.app.worker import consumer as consumer_module  # noqa: E402
from src.app.worker.consumer import handle_metadata_transfer_message  # noqa: E402
from src.core.config import config  # noqa: E402
from src.domain.service.video import Video  # noqa: E402
from src.infrastructure.database.qdrant import (  # noqa: E402
    COLLECTION_NAME,
    QdrantService,
)
from src.infrastructure.ml_model.embeding_model import EmbeddingService  # noqa: E402
from src.infrastructure.queue.rabbitmq import declare  # noqa: E402

ROUTING_KEY = "video.metadata.trans"
GET_TIMEOUT_SECONDS = 5

FAKE_TITLE_VECTOR = [0.1] * 768
FAKE_SPARSE_VECTOR = SparseVector(indices=[0, 1], values=[0.5, 0.25])

# Same real payload the api_service e2e suite pins for this workflow (see
# api_service/test/video-upload-workflow.e2e-spec.ts's "Step 2" assertion).
UPLOAD_WORKFLOW_TITLE = "Oppenheimer 4K IMAX clip"
UPLOAD_WORKFLOW_DESCRIPTION = (
    "A 3 minute 4K IMAX excerpt from Oppenheimer, used as the "
    "upload-workflow e2e fixture."
)


@pytest.fixture(autouse=True)
def real_video_service(mocker):
    """
    Wire the stub container's `video`/`qdrant`/`embedding` attributes to
    real `Video` + `QdrantService` + `EmbeddingService` instances (instead
    of the AsyncMock the stub installs by default), so
    `consumer.py`'s `container.video.process_metadata(...)` call runs the
    real business logic against a real Qdrant instance. Only the
    heavyweight ML inference is mocked, via `AsyncMock` to match
    EmbeddingService's real `async def` signature.
    """
    real_qdrant = QdrantService()
    real_embedding = EmbeddingService()
    mocker.patch.object(
        real_embedding, "embed_dense", AsyncMock(return_value=FAKE_TITLE_VECTOR)
    )
    mocker.patch.object(
        real_embedding, "embed_sparse", AsyncMock(return_value=FAKE_SPARSE_VECTOR)
    )
    real_video = Video(embedding=real_embedding, qdrant=real_qdrant, redis=MagicMock())

    mocker.patch.object(consumer_module.container, "video", real_video)
    mocker.patch.object(consumer_module.container, "qdrant", real_qdrant)
    mocker.patch.object(consumer_module.container, "embedding", real_embedding)

    return real_video, real_qdrant


@pytest.fixture(autouse=True)
async def ensure_qdrant_collection(real_video_service):
    _real_video, real_qdrant = real_video_service
    await real_qdrant.init_collection()


@pytest.fixture
async def mq_topology():
    connection = await aio_pika.connect_robust(config.MQ_URL)
    channel = await connection.channel()
    exchange, _dlx_exchange, transfer_queue, _dead_letter_queue = await declare(channel)
    try:
        yield exchange, transfer_queue
    finally:
        await connection.close()


@pytest.fixture
async def qdrant_cleanup(real_video_service):
    _real_video, real_qdrant = real_video_service
    video_ids: list[str] = []
    yield video_ids
    for video_id in video_ids:
        await real_qdrant.delete_video_point(video_id)


async def _publish_and_pull(exchange, transfer_queue, payload: dict):
    """Publish through the real exchange and pull the message back off the
    real, already-bound `video.metadata.transfer` queue -- proving the real
    queue binding works, rather than calling the handler directly."""
    await exchange.publish(
        aio_pika.Message(body=json.dumps(payload).encode()),
        routing_key=ROUTING_KEY,
    )

    message = await transfer_queue.get(fail=False, timeout=GET_TIMEOUT_SECONDS)
    assert message is not None, (
        "message was not delivered to the video.metadata.transfer queue "
        "within the timeout"
    )
    return message


class TestVideoUploadWorkflowEndToEnd:
    async def test_real_upload_metadata_payload_propagates_title_but_drops_description(
        self, real_video_service, mq_topology, qdrant_cleanup
    ):
        """
        Replays the exact wire-contract payload the api_service upload
        workflow publishes for a real uploaded video (real `description`
        key, matching PublisherService.transferVideoMetadata), and asserts
        what actually lands in Qdrant for that video: the dataflow from
        api_service reaches search_service and the title is embedded and
        upserted, but -- per bug #1, observed here rather than fixed -- the
        description is silently dropped because consumer.py only reads
        `payload.get('desc')`.
        """
        real_video, _real_qdrant = real_video_service
        exchange, transfer_queue = mq_topology
        video_id = f"e2e-upload-workflow-{uuid.uuid4()}"
        qdrant_cleanup.append(video_id)

        payload = {
            "correlationId": video_id,
            "videoId": video_id,
            "title": UPLOAD_WORKFLOW_TITLE,
            # Real api_service wire shape (see
            # api_service/src/rabbitmq/interface/transferdata.interface.ts):
            # the key is `description`, not `desc`.
            "description": UPLOAD_WORKFLOW_DESCRIPTION,
            "hashtags": ["oppenheimer", "imax", "4k"],
        }

        message = await _publish_and_pull(exchange, transfer_queue, payload)

        # Forward path works end-to-end when the field name matches: RabbitMQ
        # -> parse -> await embed -> Qdrant upsert. The response leg still
        # blows up (bugs #2/#3, already covered by
        # tests/app/worker/test_consumer.py), so this suite doesn't
        # re-verify that mechanism here.
        with pytest.raises(TypeError):
            await handle_metadata_transfer_message(message, exchange)

        # Regression guard: the embedding mocks are AsyncMock, so this only
        # passes if process_metadata actually awaited them.
        real_video.embedding.embed_dense.assert_awaited()
        real_video.embedding.embed_sparse.assert_awaited()

        verification_client = AsyncQdrantClient(url=config.QDRANT_URL)
        points = await verification_client.retrieve(
            collection_name=COLLECTION_NAME,
            ids=[video_id],
            with_payload=True,
        )

        assert len(points) == 1
        # Data handling: title propagates end-to-end (lowercased/normalized,
        # matching src/domain/service/video.py's process_metadata).
        assert points[0].payload["title"] == UPLOAD_WORKFLOW_TITLE.lower()
        # Data handling: description does NOT propagate. This is bug #1 --
        # consumer.py never finds a `desc` key in the real payload, so
        # src/infrastructure/database/qdrant.py omits the `desc` field
        # entirely rather than storing an empty/incorrect value.
        assert "desc" not in points[0].payload
