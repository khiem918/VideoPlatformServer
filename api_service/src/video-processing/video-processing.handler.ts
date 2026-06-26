import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { VideoProcessingService } from './video-processing.service';
import { TranscodingDataDto } from './dto/transcodingdata.dto';
import { InvalidVideoException } from './exceptions/invalid-video.exception';
import { TranscodedVideoPaths } from './dto/transcodingdata.dto';

@Processor('video-processing')
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

    const assetPaths : TranscodedVideoPaths = await this.processingService.transcodeVideo(jobData);

    await job.updateProgress(90);

  }


  private validateJobData(data: any): TranscodingDataDto {

    if (!data || typeof data !== 'object') {
      throw new InvalidVideoException(
        'Invalid job data: not an object',
        'unknown',
      );
    }

    const dto = new TranscodingDataDto();

    dto.processingId = data.processingId as string;
    dto.inforId = data.inforId as string;
    dto.r2Path = data.r2Path as string;
    dto.mimeType = data.mimeType as string;

    if (!dto.inforId || !dto.r2Path || !dto.mimeType || !dto.processingId) {

      throw new InvalidVideoException(
        'Missing required fields: inforId, r2Path, mimeType, processingId',
        (data.inforId as string) || 'unknown',

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
