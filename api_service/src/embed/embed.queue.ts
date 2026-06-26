import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { EmbedDataDto } from './dto/embedingdata';

@Injectable()

export class EmbedQueueService {
  private readonly logger = new Logger(EmbedQueueService.name);

  constructor(
    @InjectQueue(process.env.EMBED_QUEUE_NAME || 'embed-processing')
    private readonly queue: Queue,
  ) {}

  async addEmbedJob(data: EmbedDataDto): Promise<void> {
    try {
      const job = await this.queue.add('process-embed', data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      });

      this.logger.log(
        `Added embed processing job for videoId: ${data.videoId}`,
      );
      
    } catch (error) {
      this.logger.error(
        `Failed to add job to queue for videoId: ${data.videoId}`,
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }
}