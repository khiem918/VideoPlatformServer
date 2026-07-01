import os 
import logging
import grpc
from .generated import video_metadata_pb2_grpc as pb_grpc, video_metadata_pb2 as pb


class GrpcClient: 
    def __init__(self): 
        self._target = os.getenv("GRPC_URL", "localhost:50051")
        self._channel = grpc.aio.Channel | None = None
        self._stub = pb_grpc.VideoMetaDataServiceStub | None = None

    async def connect(self) -> None:
        self.channel =  grpc.aio.insecure_channel(
            self._target, 
            options=[
                ("grpc.keepalive_time_ms", 30000),
                ("grpc.keepalive_permit_without_calls", True),
            ]
        ) 
        
        self._stub = pb_grpc.VideoMetaDataServiceStub(self.channel)

        logging.info(f"Connected to gRPC server at {self._target}")

    async def close(self) -> None:
        if self.channel: 
            await self.channel.close()

    
    async def get_video_metadata(self, video_id: str) -> pb.VideoMetadataResponse | None :
        assert self._stub is not None, "gRPC client is not connected. Call connect() first."

        try: 
            return await self._stub.GetVideoMetadata(
                        pb.VideoMetadataRequest(video_id=video_id),
                        timeout=5.0, 
                    )    
        
        except grpc.aio.AioRpcError as e:

            if e.code() == grpc.StatusCode.NOT_FOUND:
                
                logging.warning(f"Video metadata not found for video_id: {video_id}")
                return None
           
            raise
    
    


