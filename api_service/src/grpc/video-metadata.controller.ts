import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { VideoMetaDataGrpcService } from './video-metadata.serivce';
import type { GetVideoMetaDataRequest } from './interface/video-metadata.interface';

@Controller()
export class VideoMetaDataGrpcController {

    constructor(
        private readonly videoMetaDataService: VideoMetaDataGrpcService
    ) { }

    @GrpcMethod('VideoMetaDataService', 'GetVideoMetaData')
    async getVideoMetaData(data: GetVideoMetaDataRequest) {
        const metadata = await this.videoMetaDataService.getVideoMetaData(data.videoId);

        return metadata.map((metadata) => ({ 
            video_id : metadata.videoId,
            title : metadata.videoName,
            view : metadata.videoView,
            channel : metadata.channel,
            thumb_url : metadata.thumbnailUrl,
            date : metadata.videoReleasedDate,
            description : metadata.videoDesc,
            visibility : metadata.visibility,
            duration : metadata.duration,                       
        }));
    }
}