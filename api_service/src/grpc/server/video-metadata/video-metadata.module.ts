import { Module } from '@nestjs/common';
import { VideoMetaDatarepository } from './repository/video-metadata.repository';
import { VideoMetaDataGrpcService } from './video-metadata.service';
import { VideoMetaDataGrpcController } from './video-metadata.controller';

@Module({
  imports: [],
  controllers: [VideoMetaDataGrpcController],
  providers: [VideoMetaDataGrpcService, VideoMetaDatarepository],
})
export class VideoMetaDataGrpcModule {}
