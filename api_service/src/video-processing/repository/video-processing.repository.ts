import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ProcessingStatus,
  UploadMetaStatus,
  UploadVideoStatus,
  VideoStatus,
} from '@prisma/client';

@Injectable()
export class VideoProcessingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async completeVideoProcessing(
    inforId: string,
    videoProcessingId: string,
    videoUrl: string,
    thumbnailPath: string,
    duration: number,
  ): Promise<{
    videoId: string;
    userId: string; 
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

      const video = await tx.video.update({
        where: { id: info.videoId },
        data: {
          videoPath: videoUrl,
          thumbnailPath: thumbnailPath,
          duration: duration,
        },
        select: {
          userId: true, 
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
        userId: video.userId, 
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
    await this.prisma.video.update({
      where: { id: videoId },
      data: {
        videoStatus: VideoStatus.AVAILABLE,
      },
    });
  }
}