import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from 'src/prisma/prisma.module';
import { QueueModule } from 'src/queue/queue.module';
import { VideoProcessingHandler } from './video-processing.handler';
import { VideoProcessingService } from './video-processing.service';
import { VideoProcessingQueueService } from './video-processing.queue';
import { VideoProcessingRepository } from './repository/video-processing.repository';
import { FFmpegService } from './ffmpeg.service';
import { S3Service } from 'src/s3/s3.service';

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    
    BullModule.registerQueue({
      name: process.env.QUEUE_NAME || 'video-processing',
    }),

  ],
  providers: [
    VideoProcessingHandler,
    VideoProcessingService,
    VideoProcessingQueueService,
    VideoProcessingRepository,
    FFmpegService,
    S3Service,
  ],
  exports: [VideoProcessingQueueService, VideoProcessingService],
})
export class VideoProcessingModule {}
