import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';


@Injectable()
export class VideoMetaDatarepository {
    constructor(private readonly prisma: PrismaService) { }

    async getVideoMetaData(videoId: string[]) {
        return await this.prisma.video.findMany({
            where: { id: { in: videoId } },
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