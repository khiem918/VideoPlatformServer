import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProcessingStatus, UploadVideoStatus, VideoStatus, VideoVisibility } from '@prisma/client';
import { UploadMetaStatus } from '@prisma/client';

@Injectable()
export class VideoProcessingRepository {

  constructor(private readonly prisma: PrismaService) { }

  async finalizeProcessingAndUpdateVideo(
    uploadId: string,
    videoUrl: string,
    thumbnailUrl: string,
    duration: number,
  ): Promise<void> {

    await this.prisma.$transaction(async (tx) => {

      const videoUpload = await tx.videoUpload.update({

        where: { id: uploadId },

        data: {
          videoStatus: UploadVideoStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      await tx.video.update({
        where: { id: videoUpload.videoId },
        data: {
          videoUrl,
          thumbnailUrl,
          duration,
          ...(videoUpload.metaStatus === UploadMetaStatus.PROCESSED
            ? {
              videoStatus: VideoStatus.AVAILABLE,
              visibility: VideoVisibility.PUBLIC,
            }
            : {}),
        },
      })
    });

  }

  async recordFailure(uploadId: string, processingId: string, error: string): Promise<void> {

    await this.prisma.$transaction(async (tx) => {

      const videoProcessing = await tx.videoProcessing.update({
        where: { id: processingId },

        data: {
          status: ProcessingStatus.FAILED,
          errorMessage: error,
          updatedAt: new Date(),
        },
      });

      await tx.videoUpload.update({
        where: { id: uploadId },
        data: {
          videoStatus: UploadVideoStatus.FAILED,
        },
      })

      await tx.video.update({
        where: { id: videoProcessing.videoId },
        data: {
          videoStatus: VideoStatus.VIDEO_FAILED,
        },
      })  
    });
  }
}
