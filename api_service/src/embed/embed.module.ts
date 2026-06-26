import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { EmbedService } from "./embed.service";
import { EmbedQueueService } from "./embed.queue";
import { EmbedHandler } from "./embed.handler";
import { EmbedClient } from "./embedservice/embed.client";
import { QdrantService } from "src/qdrant/qdrant.service";

@Module({
    imports: [
        BullModule.registerQueue({
            name: process.env.EMBED_QUEUE_NAME || 'embed-processing',
        }),
    ],
    providers: [EmbedService, EmbedQueueService, EmbedHandler, EmbedClient, QdrantService],
    exports: [EmbedService, EmbedQueueService, EmbedClient],
})
export class EmbedModule {}