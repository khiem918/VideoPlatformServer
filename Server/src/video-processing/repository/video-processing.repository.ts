import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProcessingStatus, UploadVideoStatus, VideoStatus, VideoVisibility } from '@prisma/client';

@Injectable()
export class VideoProcessingRepository {

  constructor(private readonly prisma: PrismaService) { }

  async updateStatus(
    uploadId: string,
    status: ProcessingStatus,
  ): Promise<{ videoUploadId: string }> {

    return await this.prisma.videoProcessing.update({

      where: { videoUploadId: uploadId },

      data: {
        status,
        updatedAt: new Date(),
      },

      select: { videoUploadId: true },

    });

  }

  async finalizeProcessingAndUpdateVideo(
    uploadId: string,
    videoUrl: string,
    thumbnailUrl: string,
    duration: number,
  ): Promise<void> {

    await this.prisma.$transaction(async (tx) => {

      await tx.videoProcessing.delete({
        where: { videoUploadId: uploadId },
      });

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
          ...(videoUpload.metaStatus === 'PROCESSED'
            ? {
              videoStatus: VideoStatus.AVAILABLE,
              visibility: VideoVisibility.PUBLIC,
            }
            : {}),
        },
      })
    });

  }

  async recordFailure(uploadId: string, error: string): Promise<void> {

    await this.prisma.$transaction(async (tx) => {

      await tx.videoProcessing.update({
        where: { videoUploadId: uploadId },

        data: {
          status: ProcessingStatus.FAILED,
          errorMessage: error,
          updatedAt: new Date(),
        },
      });

      await tx.videoUpload.update({ 
        where: { id : uploadId },
        data: {
          videoStatus: UploadVideoStatus.FAILED,
        },
      })
    });
  }
}
