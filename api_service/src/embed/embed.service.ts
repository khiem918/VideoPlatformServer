import { Injectable, Logger } from '@nestjs/common';
import { EmbedDataDto } from './dto/embedingdata';
import { EmbedClient } from './embedservice/embed.client';
import { QdrantService } from 'src/qdrant/qdrant.service';

@Injectable()
export class EmbedService {
    constructor(

        private readonly embedClient: EmbedClient,
        private readonly qdrantService: QdrantService,

    ) { }

    async processEmbed(data: EmbedDataDto): Promise<void> {
        const { videoId, userOwner, title, description, createdAt } = data;

        const res = await this.embedClient.generateVector([
            {
                videoId: videoId,
                textToEmbed: title,
            },

            ... (description ? [{
                videoId: videoId,
                textToEmbed: description,
            }] : [])

        ]);

        const vectors = Array.isArray(res) ? res : [res];
        const titleVector = vectors[0]?.vector;

        if (!titleVector) {
            throw new Error('Missing title vector from embed service');
        }

        const descVector = description && vectors.length >= 2 ? vectors[1].vector : undefined;

        await this.qdrantService.upsertVideoPoint({
            id: videoId,
            payload: {
                videoId,
                userOwner,
                title,
                description: description || null,
                createdAt,
            },
            vectors: {
                titleDense: titleVector,
                descDense: descVector,
            },
        });

    }
}
