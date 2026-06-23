import { Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { TransferVideoMetadata } from './interface/transferdata.interface';
import { EXCHANGE } from './rabbitmq.module';

@Injectable()
export class PublisherService {
    constructor(
        private readonly amqpConnection: AmqpConnection,
    ) {}


    async transferVideoMetadata(videoId: string, title ? :string, description ? : string, hashtags ? : string[]) : Promise<string> {
        const jobId  = videoId; 
        const payload : TransferVideoMetadata = {
                                                jobId,
                                                videoId,
                                                ...title && { title },
                                                ...description && { description },
                                                ...hashtags && { hashtags }
                                            };

        await this.amqpConnection.publish(
            EXCHANGE,
            'video.metadata.transfer',
            payload,
            {
                persistent: true,
            },
        );            

        return jobId;
    }
}