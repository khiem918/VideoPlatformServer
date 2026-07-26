import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { VideoProcessingService } from './video-processing.service';
import { TranscodingDataDto } from './dto/transcodingdata.dto';
import { InvalidVideoException } from './exceptions/invalid-video.exception';

@Processor(process.env.QUEUE_NAME || 'video-processing')
export class VideoProcessingHandler extends WorkerHost {
  private readonly logger = new Logger(VideoProcessingHandler.name);

  constructor(private readonly processingService: VideoProcessingService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'transcode-video') {
      this.logger.warn(
        `Unexpected job name: ${job.name}. Expected: transcode-video`,
      );

      throw new InvalidVideoException('Unknown job type', 'unknown');
    }

    await job.updateProgress(10);

    const jobData = this.validateJobData(job.data);

    await this.processingService.transcodeVideo(jobData);

    await job.updateProgress(90);
  }

  private validateJobData(data: unknown): TranscodingDataDto {
    if (!data || typeof data !== 'object') {
      throw new InvalidVideoException(
        'Invalid job data: not an object',
        'unknown',
      );
    }

    const record = data as Record<string, unknown>;
    const dto = new TranscodingDataDto();

    dto.processingId = record.processingId as string;
    dto.inforId = record.inforId as string;
    dto.objectPath = record.objectPath as string;
    dto.mimeType = record.mimeType as string;

    if (!dto.inforId || !dto.objectPath || !dto.mimeType || !dto.processingId) {
      throw new InvalidVideoException(
        'Missing required fields: inforId, objectPath, mimeType, processingId',
        (record.inforId as string) || 'unknown',
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
        dto.inforId || 'unknown',
      );
    }

    return dto;
  }
}
