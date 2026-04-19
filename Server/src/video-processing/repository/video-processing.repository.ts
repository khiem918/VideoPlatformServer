import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProcessingStatus, UploadStatus } from '@prisma/client';

@Injectable()
export class VideoProcessingRepository {
  private readonly logger = new Logger(VideoProcessingRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async updateStatus(
    uploadId: string,
    status: ProcessingStatus,
  ): Promise<{ videoUploadId: string }> {
    try {
      const updated = await this.prisma.videoProcessing.update({
        where: { videoUploadId: uploadId },
        data: {
          status,
          updatedAt: new Date(),
        },
        select: { videoUploadId: true },
      });

      this.logger.debug(`Updated video ${uploadId} status to ${status}`);
      return updated;
    } catch (error) {
      this.logger.error(
        `Failed to update video processing status for ${uploadId}`,
        error,
      );
      throw error;
    }
  }


  async recordCompletion(
    uploadId: string,
    outputPath: string,
    thumbnailPath?: string,
  ): Promise<void> {
    try {
      await this.prisma.videoProcessing.update({
        where: { videoUploadId: uploadId },
        data: {
          status: ProcessingStatus.COMPLETED,
          hlsPlaylistPath: outputPath,
          thumbnailPath,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      this.logger.debug(
        `Recorded completion for video ${uploadId} at ${outputPath}`,
      );
    } catch (error) {
      this.logger.error(`Failed to record completion for ${uploadId}`, error);
      throw error;
    }
  }

  async finalizeProcessingAndUpdateVideo(
    uploadId: string,
    videoUrl: string,
    thumbnailUrl: string,
    duration: number,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const upload = await tx.videoUpload.findUnique({
          where: { id: uploadId },
          select: { id: true, userId: true },
        });

        if (!upload) {
          throw new Error(`Video upload not found: ${uploadId}`);
        }

        await tx.videoProcessing.update({
          where: { videoUploadId: uploadId },
          data: {
            status: ProcessingStatus.COMPLETED,
            hlsPlaylistPath: videoUrl,
            thumbnailPath: thumbnailUrl,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        await tx.videoUpload.update({
          where: { id: uploadId },
          data: {
            status: UploadStatus.COMPLETED,
            completedAt: new Date(),
          },
        });

        await tx.video.update({
          where: { uploadId },
          data: {
            videoUrl,
            thumbnailUrl,
            duration,
          },
        });
      });

      this.logger.debug(`Finalized processing and updated video for ${uploadId}`);
    } catch (error) {
      this.logger.error(`Failed to finalize processing for ${uploadId}`, error);
      throw error;
    }
  }

  async recordFailure(uploadId: string, error: string): Promise<void> {
    try {
      await this.prisma.videoProcessing.update({
        where: { videoUploadId: uploadId },
        data: {
          status: ProcessingStatus.FAILED,
          errorMessage: error,
          updatedAt: new Date(),
        },
      });

      this.logger.error(`Recorded failure for video ${uploadId}: ${error}`);
    } catch (error) {
      this.logger.error(`Failed to record failure for ${uploadId}`, error);
      throw error;
    }
  }
}
