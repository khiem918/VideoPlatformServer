import { Job } from 'bullmq';
import { EmbedDataDto } from './dto/embedingdata';
import { WorkerHost, Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { EmbedService } from './embed.service';

@Processor(process.env.EMBED_QUEUE_NAME || 'embed-processing')

export class EmbedHandler extends WorkerHost {
    private readonly logger = new Logger(EmbedHandler.name);

    constructor(private readonly embedService: EmbedService) {
        super();
    }

    async process(job: Job): Promise<void> {
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

        this.logger.debug(
            `Successfully completed embed processing job ${job.id} for videoId: ${jobData.videoId}`,
        );

    }


    private validateJobData(data: any): EmbedDataDto {
        if (!data || typeof data !== 'object') {
            this.logger.error('Invalid job data format');
            throw new Error('Invalid job data format');
        }

        const { videoId, userOwner, title, description, createdAt } = data;

        if (typeof videoId !== 'string' || !videoId.trim()) {
            this.logger.error('Invalid or missing videoId');
            throw new Error('Invalid or missing videoId');
        }

        if (typeof userOwner !== 'string' || !userOwner.trim()) {
            this.logger.error('Invalid or missing userOwner');
            throw new Error('Invalid or missing userOwner');
        }

        if (typeof title !== 'string' || !title.trim()) {
            this.logger.error('Invalid or missing title');
            throw new Error('Invalid or missing title');
        }

        if (!Number.isInteger(createdAt)) {
            this.logger.error('Invalid or missing createdAt');
            throw new Error('Invalid or missing createdAt');
        }

        return {
            videoId: videoId.trim(),
            userOwner: userOwner.trim(),
            title: title.trim(),
            description: typeof description === 'string' ? description.trim() : '',
            createdAt,
        };
    }
}