import { Injectable } from '@nestjs/common';
import { VideoVisibility } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';


@Injectable()
export class VideoMetaDatarepository {
    constructor(private readonly prisma: PrismaService) { }

    async getVideoMetaData(videoId: string[], visibility?: VideoVisibility) {
        return await this.prisma.video.findMany({
            where: { 
                id: { in: videoId }, 
                ...(visibility && { visibility }),
            },
            select: {
                id: true,
                videoName: true,
                videoView: true, 
                thumbnailUrl: true,
                videoReleasedDate: true,
                videoDesc: true,
                visibility: true,
                duration: true,
                owner: { 
                    select: {
                        id: true,
                        userName: true,
                    }
                }
            }, 
        })
    }
}