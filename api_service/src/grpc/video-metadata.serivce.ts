import { Injectable } from '@nestjs/common';
import { VideoMetaDatarepository } from './repository/video-metadata.repository';
import { RpcException } from '@nestjs/microservices/exceptions/rpc-exception';
import { status as GrpcStatus } from '@grpc/grpc-js';

@Injectable()
export class VideoMetaDataGrpcService {
    constructor(
        private readonly videoMetaDataRepository: VideoMetaDatarepository
    ) { }

    /*
    
        return rule: only public video
    
    */
    async getVideoMetaData(videoId: string[]) {
        const video = await this.videoMetaDataRepository.getVideoMetaData(videoId);

        if (!video || video.length === 0) {
        throw new RpcException({
            code: GrpcStatus.NOT_FOUND,
            message: 'Video not found',
        });
        }

        return {
        videoMetadata: video.map((v) => ({
            videoId: v.id,
            title: v.videoName,             
            description: v.videoDesc || '', 
            thumbnailUrl: v.thumbnailPath,
            view: Number(v.videoView),
            duration: v.duration,
            date: Math.floor((v.videoReleasedDate?.getTime() || Date.now()) / 1000),
            channel: v.owner.id,            
            visibility: v.visibility,
        })),
        };
    }



}