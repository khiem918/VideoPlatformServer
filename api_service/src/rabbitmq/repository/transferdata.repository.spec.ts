import { ProcessingStatus } from '@prisma/client';
import { TransferDataRepository } from './transferdata.repository';
import { PrismaService } from 'src/prisma/prisma.service';

describe('TransferDataRepository', () => {
  let repository: TransferDataRepository;
  let prisma: { videoProcessing: { update: jest.Mock } };

  beforeEach(() => {
    prisma = { videoProcessing: { update: jest.fn() } };
    repository = new TransferDataRepository(prisma as unknown as PrismaService);
  });

  it('marks the processing job as completed on success', async () => {
    await repository.updateProcessingStatus('proc-1', 'successed');

    expect(prisma.videoProcessing.update).toHaveBeenCalledWith({
      where: { id: 'proc-1' },
      data: expect.objectContaining({
        status: ProcessingStatus.COMPLETED,
        completedAt: expect.any(Date),
      }),
    });
  });

  it('marks the processing job as failed with the error message', async () => {
    await repository.updateProcessingStatus('proc-1', 'failed', 'boom');

    expect(prisma.videoProcessing.update).toHaveBeenCalledWith({
      where: { id: 'proc-1' },
      data: expect.objectContaining({
        status: ProcessingStatus.FAILED,
        error: 'boom',
      }),
    });
  });

  it('marks the processing job as dead when the status is dead', async () => {
    await repository.updateProcessingStatus('proc-1', 'dead');

    expect(prisma.videoProcessing.update).toHaveBeenCalledWith({
      where: { id: 'proc-1' },
      data: { status: ProcessingStatus.DEAD },
    });
  });
});
