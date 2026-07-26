import { VideoProcessingRepository } from './video-processing.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ProcessingStatus,
  UploadVideoStatus,
  VideoStatus,
  VideoVisibility,
} from '@prisma/client';

function createTxMock() {
  return {
    videoInformation: { update: jest.fn() },
    video: { update: jest.fn() },
    videoProcessing: { update: jest.fn() },
  };
}

function createPrismaMock(tx: ReturnType<typeof createTxMock>) {
  return {
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    video: { update: jest.fn() },
  };
}

describe('VideoProcessingRepository', () => {
  let repository: VideoProcessingRepository;
  let prisma: ReturnType<typeof createPrismaMock>;
  let tx: ReturnType<typeof createTxMock>;

  beforeEach(() => {
    tx = createTxMock();
    prisma = createPrismaMock(tx);

    repository = new VideoProcessingRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('completeVideoProcessing', () => {
    it('marks the video information, video, and processing job as complete', async () => {
      tx.videoInformation.update.mockResolvedValue({
        videoId: 'video-1',
        videoStatus: UploadVideoStatus.PROCESSED,
        metaStatus: 'PROCESSED',
      });

      const result = await repository.completeVideoProcessing(
        'info-1',
        'proc-1',
        'manifest-url',
        'thumb-url',
        120,
      );

      const completedInfoData: unknown = expect.objectContaining({
        videoStatus: UploadVideoStatus.PROCESSED,
      });
      expect(tx.videoInformation.update).toHaveBeenCalledWith({
        where: { id: 'info-1' },
        data: completedInfoData,
      });
      expect(tx.video.update).toHaveBeenCalledWith({
        where: { id: 'video-1' },
        data: {
          videoPath: 'manifest-url',
          thumbnailPath: 'thumb-url',
          duration: 120,
        },
      });
      const completedProcessingData: unknown = expect.objectContaining({
        status: ProcessingStatus.COMPLETED,
      });
      expect(tx.videoProcessing.update).toHaveBeenCalledWith({
        where: { id: 'proc-1' },
        data: completedProcessingData,
      });
      expect(result).toEqual({
        videoId: 'video-1',
        videoStatus: UploadVideoStatus.PROCESSED,
        metaStatus: 'PROCESSED',
      });
    });
  });

  describe('recordFailure', () => {
    it('marks the video information and processing job as failed', async () => {
      await repository.recordFailure('info-1', 'proc-1', 'boom');

      const failedInfoData: unknown = expect.objectContaining({
        videoStatus: UploadVideoStatus.FAILED,
      });
      expect(tx.videoInformation.update).toHaveBeenCalledWith({
        where: { id: 'info-1' },
        data: failedInfoData,
      });
      const failedProcessingData: unknown = expect.objectContaining({
        status: ProcessingStatus.FAILED,
        errorMessage: 'boom',
      });
      expect(tx.videoProcessing.update).toHaveBeenCalledWith({
        where: { id: 'proc-1' },
        data: failedProcessingData,
      });
    });
  });

  describe('publicVideo', () => {
    it('marks the video as available and public', async () => {
      await repository.publicVideo('video-1');

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-1' },
        data: {
          videoStatus: VideoStatus.AVAILABLE,
          visibility: VideoVisibility.PUBLIC,
        },
      });
    });
  });
});
