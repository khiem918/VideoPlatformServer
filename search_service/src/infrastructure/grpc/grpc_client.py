import logging
import grpc
from src.core.config import config
from .generated import video_pb2_grpc as pb_grpc, video_pb2 as pb


class GrpcClient:
    def __init__(self):
        self._target = config.GRPC_URL
        self._channel : grpc.aio.Channel | None = None
        self._stub : pb_grpc.VideoMetaDataServiceStub | None = None

    async def connect(self) -> None:
        self._channel =  grpc.aio.insecure_channel(
            self._target, 
            options=[
                ("grpc.keepalive_time_ms", 30000),
                ("grpc.keepalive_permit_without_calls", True),
            ]
        ) 
        
        self._stub = pb_grpc.VideoMetaDataServiceStub(self._channel)

        logging.info(f"Connected to gRPC server at {self._target}")

    async def close(self) -> None:
        if self._channel: 
            await self._channel.close()
    
    async def get_video_metadata(self, video_ids: list[str]) -> pb.GetVideoMetaDataResponse | None :
        assert self._stub is not None, "gRPC client is not connected. Call connect() first."

        try: 
            response = await self._stub.GetVideoMetaData(
                        pb.GetVideoMetaDataRequest(video_id=video_ids),
                        timeout=5.0, 
                    )    

            return response.video_metadata

        except grpc.aio.AioRpcError as e:

            if e.code() == grpc.StatusCode.NOT_FOUND:
                
                logging.warning(f"Video metadata not found for video_ids: {video_ids}")
                return None
           
            raise