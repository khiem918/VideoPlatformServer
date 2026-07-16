"""
E2E tests for the "update video metadata" flow, search_service side.

PREREQUISITES (live infrastructure required, no mocking of RabbitMQ/Qdrant):
    - RabbitMQ and Qdrant must be running, e.g. via `docker/dev.sh start`
      (uses docker/docker-compose.api-service.yml: RabbitMQ on :5672, Qdrant
      on :6333).
    - `search_service/.env` must point MQ_URL / QDRANT_URL at those services.
    - Run with:
      `venv/bin/python -m pytest tests/e2e/test_video_metadata_update_e2e.py`

`asyncio_mode = "auto"` is configured in search_service/pyproject.toml (same
as the rest of this suite -- see tests/app/worker/test_consumer.py and
tests/domain/service/test_video.py), so plain `async def test_...` methods
are collected automatically; pytest-asyncio (see requirements-dev.txt) is
what makes that possible, no per-test `@pytest.mark.asyncio` decorator is
required to match house style.

This suite publishes real messages through the real `video.processing` topic
exchange (topology declared via `declare()` from
src/infrastructure/queue/rabbitmq.py, reused here instead of re-declaring by
hand, to stay coupled to the real topology), pulls them back off the real
`video.metadata.transfer` queue, and drives the real
`handle_metadata_transfer_message` (src/app/worker/consumer.py) against a
real Qdrant instance via a real `Video` + `QdrantService` pair. Only the
heavyweight ML inference (EmbeddingService.embed_dense / embed_sparse) is
mocked (with `AsyncMock`, matching their real `async def` signature) --
RabbitMQ, QdrantService, and Video.process_metadata all run for real.

Note on `container`: this suite does NOT import the real
`src.app.container.container` singleton. Constructing it currently raises
`AttributeError: module 'src.core.config' has no attribute 'GRPC_SERVER_URL'`
(GrpcServer.__init__ reads a config attribute that does not exist) -- an
already-documented, pre-existing bug unrelated to the metadata-update flow,
covered by
tests/app/test_container.py::TestContainerConstructionBug::test_bug_module_level_singleton_instantiation_raises_attribute_error
and worked around throughout this suite via
`tests.conftest.install_container_stub()` (see e.g.
tests/app/worker/test_consumer.py, tests/infrastructure/grpc/test_grpc_server.py).
This suite follows the same convention, then swaps the stub's `video` /
`qdrant` attributes for real `Video` / `QdrantService` instances so that
`consumer.py`'s real message-handling code still exercises real Qdrant.

Bug cross-references (bugs still present, in Python-side terms):
    - Bug #1 (field-name mismatch): consumer.py:20 reads
      `payload.get('desc')`, but api_service's PublisherService actually
      sends the key `description` (see
      api_service/src/rabbitmq/interface/transferdata.interface.ts and
      api_service/src/rabbitmq/publisher.service.ts). This is proven by
      `test_bug1_real_api_service_payload_shape_drops_description` below,
      replaying the exact wire shape pinned by
      api_service/test/video-metadata-update.e2e-spec.ts's happy-path
      assertion.
    - Bugs #2 (response body not encoded to bytes -> TypeError) and #3
      (status literal "succeeded" vs "successed") are already covered by
      search_service/tests/app/worker/test_consumer.py's
      `test_bug_publish_raises_type_error_because_body_is_not_encoded_to_bytes`.
      This suite does not re-test that mechanism in isolation; it simply
      wraps the call in `pytest.raises(TypeError)` (same precedent) because
      `handle_metadata_transfer_message` always hits that bug after a
      successful `process_metadata` call.
    - Bug #4 (no VideoProcessing row exists for the correlationId the
      publisher used) is a Postgres/api_service-side concern and is covered
      by api_service/test/video-metadata-update.e2e-spec.ts, not here.

FIXED (previously bug #6): src/domain/service/video.py's process_metadata
used to call `self.embedding.embed_dense(...)` / `embed_sparse(...)`
without `await`, even though EmbeddingService declares both `async def`.
That has been fixed (video.py:21-23 now awaits both calls) -- see
tests/domain/service/test_video.py::TestProcessMetadata::test_awaits_embedding_calls_and_passes_resolved_vectors
for the unit-level regression guard. This suite's fixtures use `AsyncMock`
for the embedding calls specifically so a regression (removing an `await`
again) would surface here too: an un-awaited `AsyncMock` call returns a
coroutine, which `QdrantService.upsert_video_point` would reject when
building the point (Pydantic `ValidationError`), failing the happy-path
test below.
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


@pytest.fixture(autouse=True)
def real_video_service(mocker):
    """
    Wire the stub container's `video`/`qdrant`/`embedding` attributes to
    real `Video` + `QdrantService` + `EmbeddingService` instances (instead
    of the AsyncMock the stub installs by default), so
    `consumer.py`'s `container.video.process_metadata(...)` call runs the
    real business logic against a real Qdrant instance. Only the
    heavyweight ML inference is mocked, via `AsyncMock` to match
    EmbeddingService's real `async def` signature (see module docstring).
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


class TestVideoMetadataUpdateEndToEnd:
    async def test_happy_path_with_correct_desc_key_upserts_title_and_desc(
        self, real_video_service, mq_topology, qdrant_cleanup
    ):
        real_video, _real_qdrant = real_video_service
        exchange, transfer_queue = mq_topology
        video_id = f"e2e-video-{uuid.uuid4()}"
        qdrant_cleanup.append(video_id)

        payload = {
            "correlationId": video_id,
            "videoId": video_id,
            "title": "Real Video Title",
            # Correct key per consumer.py's current parsing:
            # `desc = payload.get('desc')`.
            "desc": "A real description of the video",
        }

        message = await _publish_and_pull(exchange, transfer_queue, payload)

        # Forward path works end-to-end when the field name matches: RabbitMQ
        # -> parse -> await embed -> Qdrant upsert. The response leg still
        # blows up (bugs #2/#3), matching test_consumer.py's precedent.
        with pytest.raises(TypeError):
            await handle_metadata_transfer_message(message, exchange)

        # Regression guard for the fixed await-bug: the embedding mocks are
        # AsyncMock, so this only passes if process_metadata actually
        # awaited them (an un-awaited AsyncMock call is never "awaited").
        real_video.embedding.embed_dense.assert_awaited()
        real_video.embedding.embed_sparse.assert_awaited()

        verification_client = AsyncQdrantClient(url=config.QDRANT_URL)
        points = await verification_client.retrieve(
            collection_name=COLLECTION_NAME,
            ids=[video_id],
            with_payload=True,
        )

        assert len(points) == 1
        assert points[0].payload["title"] == "real video title"
        assert points[0].payload.get("desc") == "a real description of the video"

    async def test_bug1_real_api_service_payload_shape_drops_description(
        self, mq_topology, qdrant_cleanup
    ):
        """
        Regression test for bug #1: api_service's publisher.service.ts
        actually publishes the key `description`
        (api_service/src/rabbitmq/interface/transferdata.interface.ts), but
        consumer.py:20 reads `payload.get('desc')`. Replaying the exact
        real wire shape (as pinned by
        api_service/test/video-metadata-update.e2e-spec.ts's happy-path
        assertion) proves the description is silently dropped end-to-end,
        even though the title still makes it through.
        """
        exchange, transfer_queue = mq_topology
        video_id = f"e2e-video-{uuid.uuid4()}"
        qdrant_cleanup.append(video_id)

        payload = {
            "correlationId": video_id,
            "videoId": video_id,
            "title": "Another Title",
            # Real api_service wire shape: key is `description`, not `desc`.
            "description": "This description should be dropped by bug #1",
        }

        message = await _publish_and_pull(exchange, transfer_queue, payload)

        with pytest.raises(TypeError):
            await handle_metadata_transfer_message(message, exchange)

        verification_client = AsyncQdrantClient(url=config.QDRANT_URL)
        points = await verification_client.retrieve(
            collection_name=COLLECTION_NAME,
            ids=[video_id],
            with_payload=True,
        )

        assert len(points) == 1
        assert points[0].payload["title"] == "another title"
        # desc payload field is omitted entirely when desc is falsy
        # (src/infrastructure/database/qdrant.py:108-109), which is exactly
        # what happens here because consumer.py never found a `desc` key.
        assert "desc" not in points[0].payload
