import { Module } from "@nestjs/common";
import { VideoMetaDatarepository } from "./repository/video-metadata.repository";
import { VideoMetaDataGrpcService } from "./video-metadata.serivce";

@Module({
    imports: [],
    providers: [VideoMetaDataGrpcService, VideoMetaDatarepository],
})

export class VideoMetaDataGrpcModule {}