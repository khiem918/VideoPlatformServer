import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import {
  TranscodingDataDto,
  TranscodingResponse,
} from './dto/transcodingdata.dto';

@Injectable()
export class VideoProcessingQueueService {
  private readonly logger = new Logger(VideoProcessingQueueService.name);

  constructor(
    @InjectQueue(process.env.QUEUE_NAME || 'video-processing')
    private readonly queue: Queue,
  ) {}

  async addTranscodingJob(data: TranscodingDataDto): Promise<string> {
<<<<<<< HEAD
      const job = await this.queue.add('transcode-video', data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: true,           /// retry by cronjob 
      });

      this.logger.log(
        `Added transcoding job for inforId: ${data.inforId}, processingId: ${data.processingId}, jobId: ${job.id}`,
      );
      
      job.updateProgress(5);

      return job.id as string;
=======
    const job = await this.queue.add('transcode-video', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: true, /// retry by cronjob
    });

    this.logger.log(
      `Added transcoding job for inforId: ${data.inforId}, processingId: ${data.processingId}, jobId: ${job.id}`,
    );

    job.updateProgress(5);

    return job.id as string;
>>>>>>> main
  }

  async getJobStatus(jobId: string): Promise<TranscodingResponse | null> {
    try {
      const job = await this.queue.getJob(jobId);

      if (!job) {
        this.logger.warn(`Job not found: ${jobId}`);
        return null;
      }

      const state = await job.getState();

      const progress =
        typeof job.progress === 'function'
          ? (job.progress() as number | null)
          : (job.progress as unknown as number | null);

      return {
        jobId: job.id as string,
        inforId: (job.data as TranscodingDataDto).inforId,
        status: state || 'unknown',
        progress: progress || undefined,
        error: job.failedReason || undefined,
        startedAt: job.processedOn ? new Date(job.processedOn) : new Date(),
        completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get job status for ${jobId}`,
        error instanceof Error ? error.stack : error,
      );

      throw error;
    }
  }

  async removeJob(jobId: string): Promise<void> {
    try {
      const job = await this.queue.getJob(jobId);

      if (!job) {
        this.logger.warn(`Cannot remove job not found: ${jobId}`);
        return;
      }

      await job.remove();

      this.logger.log(`Removed job: ${jobId}`);
    } catch (error) {
      this.logger.error(
        `Failed to remove job ${jobId}`,
        error instanceof Error ? error.stack : error,
      );

      throw error;
    }
  }
}
