import logging
import grpc 
from src.app import container
from src.core import config
from .generated import (
    video_pb2 as pb,
    video_pb2_grpc as pb_grpc,
)

logger = logging.getLogger(__name__)
GRACE_PERIOD_SECONDS = 5.0


class DeleteVideoServicer(pb_grpc.DeleteVideoServiceServicer): 
    def __init__(self): 
        pass

    async def GetDeleteVideo(
        self, 
        request: pb.GetDeleteVideoRequest, 
        context: grpc.aio.ServicerContext
    ) -> pb.GetDeleteVideoResponse:
        
        video_id = request.video_id
        if not video_id:
            await context.abort(
                grpc.StatusCode.INVALID_ARGUMENT, 
                "video_id must not be null"
            )

        try: 
            
            await container.video.delete_video(video_id)
            return pb.GetDeleteVideoResponse(status=pb.DELETE_VIDEO_STATUS_SUCCEEDED)

        except Exception as e: 
            logger.exception(f"Failed to delete video by id: {video_id}")

            await context.abort(
                grpc.StatusCode.INTERNAL, 
                f"Failed to delete video by id: {video_id}",
            )
            raise
            

class GrpcServer:
    def __init__(self):
        self._GRPC_SERVER_URL = config.GRPC_SERVER_URL
        self._server : grpc.aio.Server | None = None

    async def connect(self, port: int):
        self._server = grpc.aio.server()
        pb_grpc.add_DeleteVideoServiceServicer_to_server(
            DeleteVideoServicer(), 
            self._server,
        )

        self._server.add_insecure_port(config.GRPC_URL)
        self._server.start()

        logger.info(f"gRPC server started on {config.GRPC_URL}")


    async def disconnect(self, grace: int = 0):
        if self._server is not None: 
            await self._server.stop(GRACE_PERIOD_SECONDS)
            logger.info("gRPC server stopped gracefully.")