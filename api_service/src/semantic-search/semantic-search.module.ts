import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SemanticQueueService } from './semantic-search.queue';

@Module({
  imports: [
    BullModule.registerQueue({
      name: process.env.SEMANTIC_QUEUE_NAME || 'video-semantic-indexing',
    }),
  ],
  providers: [SemanticQueueService],
  exports: [SemanticQueueService],   // ⬅ quan trọng: để module khác (video-processing) import được
})
export class SemanticSearchModule {}