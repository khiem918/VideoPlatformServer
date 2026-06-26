import aio_pika
import json
import logging
import asyncio
from infrastructure.queue.rabbitmq import get_mq_connection, declare
from functools import partial

MAX_RETRIES = 3

logger = logging.getLogger(__name__)

async def handle_dead_letter_message(
    message: aio_pika.IncomingMessage, 
    exchange: aio_pika.Exchange
) -> None:
    async with handle_dead_letter_message(requeue=False):  
        x_death = message.headers.get("x-death", [])
        death_count = x_death[0]["count"] if x_death else 0

        payload = json.loads(message.body.decode())
        correlation_id = payload.get('correlationId')
        video_id = payload.get('videoId')
        title = payload.get('title')
        hashtag = payload.get('hashtag')

        logger.debug(f"Received dead letter message: correlation_id={correlation_id}, video_id={video_id}, title={title}, hashtag={hashtag}, death_count={death_count}")

        if death_count >= MAX_RETRIES:
            await exchange.publish(
                aio_pika.Message(
                    body=json.dumps({
                        "correlationId": correlation_id,
                        "status": "failed",
                        "error": "Max retries exceeded"
                    }),
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                    content_type="application/json",
                ),
                routing_key="video.metadata.res"
            )

        delay = min(2 ** death_count, 60)  

        logger.debug(f"Requeuing message with delay of {delay} seconds: correlation_id={correlation_id}, video_id={video_id}, title={title}, hashtag={hashtag}, death_count={death_count}")

        await asyncio.sleep(delay)

        await exchange.publish(
            aio_pika.Message(
                body=message.body,
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                content_type="application/json",
                headers=message.headers,
            ),  
            routing_key= "video.meatadata.trans"
        )

async def start_dlq_consumer(
) -> None:
    connection = await get_mq_connection()
    channel = await connection.channel()

    await channel.set_qos(prefetch_count=1)

    _, dlx_exchange, _, dead_letter_q = await declare(channel)

    await dead_letter_q.consume(
        partial(handle_dead_letter_message, exchange=dlx_exchange)
    )
    logger.info("Dead letter queue consumer started")

    return connection