import { Injectable, Logger } from '@nestjs/common';
import { EmbedDataDto } from './dto/embedingdata';
import { EmbedClient } from './embedservice/embed.client';
import { QdrantService } from 'src/qdrant/qdrant.service';

export class EmbedService {
    private readonly logger = new Logger(EmbedService.name);

    constructor(
        private readonly EmbedClient: EmbedClient,
        private readonly qdrantService: QdrantService,
    ) { }

    async processEmbed(data: EmbedDataDto): Promise<void> {
        const { videoId, title, description } = data;

        try {
            const res = await this.EmbedClient.generateVector([
                {
                    videoId: videoId,
                    textToEmbed: title,
                },

                ... (description ? [{
                    videoId: videoId,
                    textToEmbed: description,
                }] : [])

            ]);

            this.logger.log(`Vector generation response: ${JSON.stringify(res)}`);

            if (res && Array.isArray(res) && res.length === 2) {
                const titleVector = res[0].vector;
                const descVector = res[1].vector;

                await this.qdrantService.upsertVideoVectors(videoId, titleVector, descVector, {
                    title,
                    description,
                });

            } else {
                await this.qdrantService.upsertVideoVectors(videoId, res[0].vector, undefined, {
                    title,
                    description,
                });
            }
        } catch (error) {
            this.logger.error(`Error occurred while generating vectors: ${error.message}`);
        }

        this.logger.log(`Processing embed for videoId: ${data.videoId}`);
        this.logger.log(`Title: ${data.title}`);
        this.logger.log(`Description: ${data.description}`);
    }
}   