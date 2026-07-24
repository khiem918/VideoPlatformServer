import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface SemanticIndexingJobData {
  inforId: string;
  processingId: string;
  videoId: string;
  userId: string;
  r2Path: string;
  mimeType: string;
}

@Injectable()
export class SemanticQueueService {
  private readonly logger = new Logger(SemanticQueueService.name);

  constructor(
    @InjectQueue(process.env.SEMANTIC_QUEUE_NAME || 'video-semantic-indexing')
    private readonly semanticQueue: Queue,
  ) {}

  async addSemanticIndexingJob(data: SemanticIndexingJobData): Promise<string> {
    const job = await this.semanticQueue.add('semantic-index-video', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: true,
    });

    this.logger.log(
      `Added semantic indexing job for videoId: ${data.videoId}, jobId: ${job.id}`,
    );

    return job.id as string;
  }
}