import aio_pika
import json
import logging
from infrastructure.queue.rabbitmq import get_mq_connection, declare

PREFETCH_COUNT = 1 # depend on number of instances 

logger = logging.getLogger(__name__)

async def handle_metadata_transfer_message(
    message: aio_pika.IncomingMessage,
    exchange: aio_pika.Exchange,
) -> None:
    async with message.process(requeue= False):     # it wraps the ack/nack
        payload = json.loads(message.body.decode()) 
        correlation_id = payload.get('correlationId')
        video_id = payload.get('videoId')
        title = payload.get('title')
        hashtag = payload.get('hashtag')

        logger.debug(f"Received metadata transfer message: correlation_id={correlation_id}, video_id={video_id}, title={title}, hashtag={hashtag}")

        ## call heandler 

        result= "" # result from handler


        await exchange.publish(
            aio_pika.Message(
                body = json.dumps({
                    "correlationId": correlation_id,
                    "status": "successed",
                }),
                delivery_mode = aio_pika.DeliveryMode.PERSISTENT,
                content_type = "application/json",
            ), 
            routing_key = "video.metadata.trans"
        )

async def start_consumer(): 
    connection = await get_mq_connection()
    channel = await connection.channel()

    await channel.set_qos(prefetch_count=PREFETCH_COUNT)

    exchange, _, video_metadata_transfer_q = await declare(channel)

    await video_metadata_transfer_q.consume(
        lambda message: handle_metadata_transfer_message(message, exchange)
    )

    logger.info("RabbitMQ consumers started (prefetch=%d)", PREFETCH_COUNT)
    return connection