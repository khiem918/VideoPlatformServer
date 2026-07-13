import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ProcessingStatus,
  UploadMetaStatus,
  UploadVideoStatus,
  VideoStatus,
  VideoVisibility,
} from '@prisma/client';

@Injectable()
export class VideoProcessingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async completeVideoProcessing(
    inforId: string,
    videoProcessingId: string,
    videoUrl: string,
    thumbnailUrl: string,
    duration: number,
  ): Promise<{
    videoId: string;
    videoStatus: UploadVideoStatus;
    metaStatus: UploadMetaStatus;
  }> {
    return await this.prisma.$transaction(async (tx) => {
      const info = await tx.videoInformation.update({
        where: { id: inforId },

        data: {
          videoStatus: UploadVideoStatus.PROCESSED,
          videoUpdatedAt: new Date(),
        },
      });

      await tx.video.update({
        where: { id: info.videoId },
        data: {
          videoUrl: videoUrl,
          thumbnailUrl: thumbnailUrl,
          duration: duration,
        },
      });

      await tx.videoProcessing.update({
        where: { id: videoProcessingId },
        data: {
          completedAt: new Date(),
          status: ProcessingStatus.COMPLETED,
        },
      });

      return {
        videoId: info.videoId,
        videoStatus: info.videoStatus,
        metaStatus: info.metaStatus,
      };
    });
  }

  async recordFailure(
    inforId: string,
    videoProcessingId: string,
    error: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.videoInformation.update({
        where: { id: inforId },

        data: {
          videoStatus: UploadVideoStatus.FAILED,
          videoUpdatedAt: new Date(),
        },
      });

      await tx.videoProcessing.update({
        where: { id: videoProcessingId },
        data: {
          completedAt: new Date(),
          status: ProcessingStatus.FAILED,
          errorMessage: error,
        },
      });
    });
  }

  async publicVideo(videoId: string): Promise<void> {
    this.prisma.video.update({
      where: { id: videoId },
      data: {
        videoStatus: VideoStatus.AVAILABLE,
        visibility: VideoVisibility.PUBLIC,
      },
    });
  }
}
