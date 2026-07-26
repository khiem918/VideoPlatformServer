import { Injectable } from '@nestjs/common';
import { VideoMetaDatarepository } from './repository/video-metadata.repository';
import { RpcException } from '@nestjs/microservices/exceptions/rpc-exception';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { VideoVisibility } from '@prisma/client';

@Injectable()
export class VideoMetaDataGrpcService {
  constructor(
    private readonly videoMetaDataRepository: VideoMetaDatarepository,
  ) {}

  /*
    
        return rule: only public video
    
    */
  async getVideoMetaData(videoId: string[]) {
    const video = await this.videoMetaDataRepository.getVideoMetaData(
      videoId,
      VideoVisibility.PUBLIC,
    );

    if (!video) {
      throw new RpcException({
        code: GrpcStatus.NOT_FOUND,
        message: 'Video not found',
      });
    }

    return video.map((v) => ({
      videoId: v.id,
      videoName: v.videoName,
      videoView: v.videoView,
      channel: v.owner.userName ? v.owner.userName : v.owner.id,
      thumbnailUrl: v.thumbnailPath,
      videoReleasedDate: v.videoReleasedDate,
      videoDesc: v.videoDesc?.slice(0, 50),
      visibility: v.visibility,
      duration: v.duration,
    }));
  }
}
