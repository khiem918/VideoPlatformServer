import aio_pika
import json
import logging
from src.infrastructure.queue.rabbitmq import get_mq_connection, declare
from src.app.container import container

PREFETCH_COUNT = 1

logger = logging.getLogger(__name__)

async def handle_metadata_transfer_message(
    message: aio_pika.IncomingMessage,
    exchange: aio_pika.Exchange,
) -> None:
    async with message.process(requeue=False):
        payload = json.loads(message.body.decode())
        correlation_id = payload.get('correlationId')
        video_id = payload.get('videoId')
        title = payload.get('title')
        desc = payload.get('desc')
        desc = payload.get('desc') or payload.get('description')
        user_id = payload.get('userId') or payload.get('userOwner')
        visibility = payload.get('visibility', 'PUBLIC')

        logger.debug(f"Received metadata transfer message: correlation_id={correlation_id}, video_id={video_id}")
        
        # Gọi service video từ nhánh main, truyền thêm tham số quyền riêng tư từ nhánh feat
        await container.video.process_metadata(
            video_id, title, desc, user_id=user_id, visibility=visibility
        )

        await exchange.publish(
            aio_pika.Message(
                body=json.dumps({
                    "correlationId": correlation_id,
                    "status": "succeeded",
                }).encode("utf-8"),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                content_type="application/json",
            ),
            routing_key="video.metadata.res",
        )

async def start_consumer():
    connection = await get_mq_connection()
    channel = await connection.channel()

    await channel.set_qos(prefetch_count=PREFETCH_COUNT)

    exchange, _, video_metadata_transfer_q, _ = await declare(channel)

    await video_metadata_transfer_q.consume(
        lambda message: handle_metadata_transfer_message(message, exchange)
    )

    logger.info("RabbitMQ consumers started (prefetch=%d)", PREFETCH_COUNT)
    return connection