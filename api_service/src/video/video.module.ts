import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { VideoRepository } from "./repository/video.repository";
import { VideoService } from "./video.service";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/s3/s3.service";
import { VideoResolver } from "./video.resolver";
import { VideoProcessingModule } from "src/video-processing/video-processing.module";
import { QdrantModule } from "src/qdrant/qdrant.module";
import { NotificationModule } from "src/notification/notification.module";

@Module({
    imports: [
        VideoProcessingModule,
        QdrantModule,
        NotificationModule,
        BullModule.registerQueue({
            name: process.env.QUEUE_NAME || 'video-processing',
        }),
    ],
    controllers: [
        // VideoController
    ],
    providers: [
        S3Service,
        PrismaService,
        ConfigService,
        VideoRepository,
        VideoService,
        VideoResolver,
    ],
    exports: [VideoService],
})
export class VideoModule { }