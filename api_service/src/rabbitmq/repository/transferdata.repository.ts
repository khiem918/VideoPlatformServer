import { PrismaService } from "src/prisma/prisma.service";
import { Injectable } from "@nestjs/common";
import { ProcessingStatus } from "@prisma/client";

@Injectable()
export class TransferDataRepository {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async updateProcessingStatus(
        processingId: string,
        status: 'successed' | 'failed' | 'dead',
        error?: string): Promise<void> {

        const stus: ProcessingStatus = status === 'successed' ? ProcessingStatus.COMPLETED
            : (status === 'failed' ? ProcessingStatus.FAILED
                : ProcessingStatus.DEAD);

        await this.prisma.videoProcessing.update({
            where: { id: processingId },
            data: {
                status: stus,
                ...(error && { error: error }),
                ...(status === 'successed' && { completedAt: new Date() })
            }
        });
    }
}