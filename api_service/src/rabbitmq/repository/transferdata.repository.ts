import { PrismaService } from 'src/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { UploadMetaStatus } from '@prisma/client';
import { ProcessingStatus } from '@prisma/client';

@Injectable()
export class TransferDataRepository {
  constructor(private readonly prisma: PrismaService) { }

  async updateMetaProcessingStatus(
    processingId: string,
    status: 'succeeded' | 'failed',
  ): Promise<void> {

    await this.prisma.videoProcessing.update({
      where: { id: processingId },
      data: {
        status: status === 'succeeded' ? ProcessingStatus.COMPLETED : ProcessingStatus.FAILED,
        videoInformation: {
          update: {
            metaStatus: status === 'succeeded' ? UploadMetaStatus.PROCESSED : UploadMetaStatus.FAILED,
          }
        }
      }
    });

  }
}



