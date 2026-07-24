import { ProcessingStatus, UploadMetaStatus } from '@prisma/client';
import { TransferDataRepository } from './transferdata.repository';
import { PrismaService } from 'src/prisma/prisma.service';

describe('TransferDataRepository', () => {
  let repository: TransferDataRepository;
  let prisma: { videoProcessing: { update: jest.Mock } };

  beforeEach(() => {
    prisma = { videoProcessing: { update: jest.fn() } };
    repository = new TransferDataRepository(prisma as unknown as PrismaService);
  });

  it('marks the processing and video metadata as completed on success', async () => {
    await repository.updateMetaProcessingStatus('proc-1', 'succeeded');

    expect(prisma.videoProcessing.update).toHaveBeenCalledWith({
      where: { id: 'proc-1' },
      data: {
        status: ProcessingStatus.COMPLETED,
        videoInformation: {
          update: { metaStatus: UploadMetaStatus.PROCESSED },
        },
      },
    });
  });

  it('marks the processing and video metadata as failed', async () => {
    await repository.updateMetaProcessingStatus('proc-1', 'failed');

    expect(prisma.videoProcessing.update).toHaveBeenCalledWith({
      where: { id: 'proc-1' },
      data: {
        status: ProcessingStatus.FAILED,
        videoInformation: {
          update: { metaStatus: UploadMetaStatus.FAILED },
        },
      },
    });
  });
});
