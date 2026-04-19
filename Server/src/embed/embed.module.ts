import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { EmbedService } from "./embed.service";
import { EmbedQueueService } from "./embed.queue";
import { EmbedHandler } from "./embed.handler";

@Module({
    imports: [
        BullModule.registerQueue({
            name: process.env.EMBED_QUEUE_NAME || 'embed-processing',
        }),
    ],
    providers: [EmbedService, EmbedQueueService, EmbedHandler],
    exports: [EmbedService, EmbedQueueService],
})
export class EmbedModule {}