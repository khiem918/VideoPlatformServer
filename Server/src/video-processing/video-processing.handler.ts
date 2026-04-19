import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { VideoProcessingService } from './video-processing.service';
import { TranscodingDataDto } from './dto/transcodingdata.dto';
import { InvalidVideoException } from './exceptions/invalid-video.exception';
import { TranscodingFailedException } from './exceptions/transcoding-failed.exception';
import { TranscodedVideoPaths } from './video-processing.service';


@Processor('video-processing')
export class VideoProcessingHandler extends WorkerHost {
  private readonly logger = new Logger(VideoProcessingHandler.name);

  constructor(private readonly processingService: VideoProcessingService) {
    super();
  }

  async process(job: Job): Promise<void> {
    try {
      if (job.name !== 'transcode-video') {
        this.logger.warn(
          `Unexpected job name: ${job.name}. Expected: transcode-video`,
        );
        throw new InvalidVideoException('Unknown job type', 'unknown');
      }

      const jobData = this.validateJobData(job.data);

      this.logger.log(
        `Processing transcoding job ${job.id} for uploadId: ${jobData.uploadId}`,
      );

      const assetPaths: TranscodedVideoPaths = await this.processingService.transcodeVideo(jobData);

      this.logger.log(
        `Successfully completed transcoding job ${job.id}. Manifest: ${assetPaths.manifestPath}, Thumbnail: ${assetPaths.thumbnailPath}`,
      );

      await job.updateProgress(100);
    } catch (error) {
      if (error instanceof InvalidVideoException) {
        this.logger.error(
          `Non-retryable error in job ${job.id}: ${error.message}`,
        );
        throw error;
      }

      if (error instanceof TranscodingFailedException) {
        this.logger.warn(`Retryable error in job ${job.id}: ${error.message}`);
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Unexpected error in job ${job.id}: ${errorMessage}`);

      throw new TranscodingFailedException(
        `Unexpected error during transcoding: ${errorMessage}`,
        ((job.data as Record<string, unknown>).uploadId as string) || 'unknown',
      );
    }
  }


  private validateJobData(data: any): TranscodingDataDto {
    if (!data || typeof data !== 'object') {
      throw new InvalidVideoException(
        'Invalid job data: not an object',
        'unknown',
      );
    }

    const dto = new TranscodingDataDto();
    dto.uploadId = data.uploadId as string;
    dto.r2Path = data.r2Path as string;
    dto.mimeType = data.mimeType as string;

    if (!dto.uploadId || !dto.r2Path || !dto.mimeType) {
      throw new InvalidVideoException(
        'Missing required fields: uploadId, r2Path, mimeType',
        (data.uploadId as string) || 'unknown',
      );
    }

    const supportedMimeTypes = [
      'video/mp4',
      'video/x-matroska',
      'video/webm',
      'video/quicktime',
      'video/x-msvideo',
    ];

    if (!supportedMimeTypes.includes(dto.mimeType)) {
      throw new InvalidVideoException(
        `Unsupported MIME type: ${dto.mimeType}`,
        dto.uploadId,
      );
    }

    return dto;
  }
}
