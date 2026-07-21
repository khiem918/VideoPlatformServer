import { PrismaService } from 'src/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { UploadMetaStatus } from '@prisma/client';

@Injectable()
export class TransferDataRepository {
  constructor(private readonly prisma: PrismaService) {}

  async updateMetaProcessingStatus(
    videoId: string,
    status: 'succeeded' | 'failed',
  ): Promise<void> {
    await this.prisma.videoInformation.update({
      where: { videoId },
      data: {
        metaStatus:
          status === 'succeeded'
            ? UploadMetaStatus.PROCESSED
            : UploadMetaStatus.FAILED,
      },
    });
  }
}
