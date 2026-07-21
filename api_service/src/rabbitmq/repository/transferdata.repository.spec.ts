import { UploadMetaStatus } from '@prisma/client';
import { TransferDataRepository } from './transferdata.repository';
import { PrismaService } from 'src/prisma/prisma.service';

describe('TransferDataRepository', () => {
  let repository: TransferDataRepository;
  let prisma: { videoInformation: { update: jest.Mock } };

  beforeEach(() => {
    prisma = { videoInformation: { update: jest.fn() } };
    repository = new TransferDataRepository(prisma as unknown as PrismaService);
  });

  it('marks the video metadata as processed on success', async () => {
    await repository.updateMetaProcessingStatus('video-1', 'succeeded');

    expect(prisma.videoInformation.update).toHaveBeenCalledWith({
      where: { videoId: 'video-1' },
      data: { metaStatus: UploadMetaStatus.PROCESSED },
    });
  });

  it('marks the video metadata as failed', async () => {
    await repository.updateMetaProcessingStatus('video-1', 'failed');

    expect(prisma.videoInformation.update).toHaveBeenCalledWith({
      where: { videoId: 'video-1' },
      data: { metaStatus: UploadMetaStatus.FAILED },
    });
  });
});
