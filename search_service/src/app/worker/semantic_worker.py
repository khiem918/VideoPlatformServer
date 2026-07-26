import logging
import os
from bullmq import Worker
from redis.asyncio import Redis
from src.app.container import container

logger = logging.getLogger(__name__)

QUEUE_NAME = os.getenv("SEMANTIC_QUEUE_NAME", "video-semantic-indexing")
QUEUE_HOST = os.getenv("QUEUE_HOST", "localhost")
QUEUE_PORT = int(os.getenv("QUEUE_PORT", "6379"))


async def process_job(job, job_token):
    """
    Handler cho mỗi job transcoding nhận từ BullMQ.
    Job data có format TranscodingDataDto:
        { inforId, processingId, r2Path, mimeType }
    """
    data          = job.data
    infor_id      = data.get("inforId")
    processing_id = data.get("processingId")
    r2_path       = data.get("r2Path")
    mime_type     = data.get("mimeType")
    user_owner    = data.get("userId")
    visibility    = data.get("visibility", "DRAFT")

    logger.info(
        f"Nhận job: infor_id={infor_id}, "
        f"processing_id={processing_id}, r2_path={r2_path}"
    )
    
    try:
        await container.video_processing.process(
            infor_id=infor_id,
            processing_id=processing_id,
            r2_path=r2_path,
            mime_type=mime_type,
            user_owner=user_owner,
            visibility=visibility,
        )

        logger.info(f"Hoàn thành job: infor_id={infor_id}")
    except Exception as e:
        logger.error(f"❌ Job thất bại (infor_id={infor_id}): {str(e)}", exc_info=True)
        raise

async def start_semantic_worker():
    """
    Khởi động BullMQ worker lắng nghe queue 'video-processing' trên Redis db=1.
    Chú ý: db=1 khác với Redis cache của search service (db=0, port 6380).
    """
    redis_connection = Redis(
        host=QUEUE_HOST,
        port=QUEUE_PORT,   
        db=1,              
        decode_responses=False,
    )

    worker = Worker(
        QUEUE_NAME,
        process_job,
        {
            "connection": redis_connection,
            "concurrency": 1,  
        },
    )

    logger.info(
        f"Semantic search worker started: "
        f"queue={QUEUE_NAME}, host={QUEUE_HOST}:{QUEUE_PORT}, db=1"
    )

    return worker