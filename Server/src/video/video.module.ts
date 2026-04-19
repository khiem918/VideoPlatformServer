import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { VideoRepository } from "./repository/video.repository";
import { VideoService } from "./video.service";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/s3/s3.service";
import { VideoResolver } from "./video.resolver";
import { EmbedModule } from "src/embed/embed.module";
import { VideoProcessingModule } from "src/video-processing/video-processing.module";
import { SemanticProcessingService } from "src/semantic-processing/semantic-processing.service";
import { TagService } from "src/tag/tag.service";

@Module({
    imports: [
        EmbedModule,
        VideoProcessingModule,
        BullModule.registerQueue({
            name: process.env.QUEUE_NAME || 'video-processing',
        }),
    ],
    providers: [
        S3Service,
        PrismaService,
        ConfigService,
        VideoRepository,
        VideoService,
        VideoResolver,
        SemanticProcessingService, 
        TagService,
        
    ],
    exports: [VideoService],
})
export class VideoModule { }