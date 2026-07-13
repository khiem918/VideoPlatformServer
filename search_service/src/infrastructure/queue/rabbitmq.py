import aio_pika

from src.core.config import config

MQ_URL = config.MQ_URL

EXCHANGE = "video.processing"
DLX_EXCHANGE = "video.processing.dlx"

async def get_mq_connection() -> aio_pika.RobustConnection:
    return await aio_pika.connect_robust(MQ_URL)

async def declare(channel: aio_pika.RobustChannel) -> None:
    
    exchange = await channel.declare_exchange(
        EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
    )


    video_metadata_transfer_q = await channel.declare_queue(
        "video.metadata.transfer",
        durable=True,
        arguments={
            "x-dead-letter-exchange": DLX_EXCHANGE,
            "x-dead-letter-routing-key": "video.metadata.trans",
        },
    )

    await video_metadata_transfer_q.bind(exchange, routing_key="video.metadata.trans")


    video_metadata_transfer_result_q = await channel.declare_queue(
        "video.metadata.response", 
        durable=True,
        arguments={
            "x-dead-letter-exchange": DLX_EXCHANGE,
            "x-dead-letter-routing-key": "video.metadata.res",
        },
    )

    await video_metadata_transfer_result_q.bind(exchange, routing_key="video.metadata.res")


    dlx_exchange = await channel.declare_exchange(
        DLX_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
    )

    dead_letter_q = await channel.declare_queue("video.metadata.dead-letter", durable=True)

    await dead_letter_q.bind(dlx_exchange, routing_key="#")


    return exchange, dlx_exchange, video_metadata_transfer_q, dead_letter_q




