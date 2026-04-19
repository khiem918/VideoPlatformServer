import { Job } from 'bullmq';
import { EmbedDataDto } from './dto/embedingdata';
import { WorkerHost, Processor } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { EmbedService } from './embed.service';

@Processor(process.env.EMBED_QUEUE_NAME || 'embed-processing')

export class EmbedHandler extends WorkerHost {
    private readonly logger = new Logger(EmbedHandler.name);

    constructor(private readonly embedService: EmbedService) {
        super();
    }

    async process(job: Job): Promise<void> {
        try {
            if (job.name !== 'process-embed') {
                this.logger.warn(
                    `Unexpected job name: ${job.name}. Expected: process-embed`,
                );
                throw new Error('Unknown job type');
            }

            const jobData = this.validateJobData(job.data);

            this.logger.log(
                `Processing embed job ${job.id} for videoId: ${jobData.videoId}`,
            );

            await this.embedService.processEmbed(jobData);

            this.logger.log(
                `Successfully completed embed processing job ${job.id} for videoId: ${jobData.videoId}`,
            );

        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Unexpected error in job ${job.id}: ${errorMessage}`);
        }
    }


    private validateJobData(data: any): EmbedDataDto {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid job data format');
        }

        const { videoId, title, description} = data;

        if (typeof videoId !== 'string' || !videoId.trim()) {
            throw new Error('Invalid or missing videoId');
        }

        if (typeof title !== 'string' || !title.trim()) {
            throw new Error('Invalid or missing title');
        }

        return {
            videoId: videoId.trim(),
            title: title.trim(),
            description: description.trim() || '', 
            // tags: Array.isArray(tags) ? tags : [],
        };
    }
}