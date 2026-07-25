import { VideoProcessingQueueService } from './video-processing.queue';
import { Queue } from 'bullmq';

describe('VideoProcessingQueueService', () => {
  let service: VideoProcessingQueueService;
  let queue: jest.Mocked<Queue>;

  beforeEach(() => {
    queue = {
      add: jest.fn(),
      getJob: jest.fn(),
    } as unknown as jest.Mocked<Queue>;

    service = new VideoProcessingQueueService(queue);
  });

  describe('addTranscodingJob', () => {
    it('enqueues a transcode-video job with retry configuration and returns the job id', async () => {
      const job = { id: 'job-1', updateProgress: jest.fn() };
      queue.add.mockResolvedValue(job as any);

      const result = await service.addTranscodingJob({
        processingId: 'proc-1',
        inforId: 'info-1',
        r2Path: 'r2/path',
        mimeType: 'video/mp4',
      });

      expect(queue.add).toHaveBeenCalledWith(
        'transcode-video',
        expect.objectContaining({ processingId: 'proc-1' }),
        expect.objectContaining({ attempts: 3, removeOnComplete: true }),
      );
      expect(job.updateProgress).toHaveBeenCalledWith(5);
      expect(result).toBe('job-1');
    });
  });

  describe('getJobStatus', () => {
    it('returns null when the job is not found', async () => {
      queue.getJob.mockResolvedValue(undefined);

      const result = await service.getJobStatus('job-1');

      expect(result).toBeNull();
    });

    it('returns the job status details when the job exists', async () => {
      queue.getJob.mockResolvedValue({
        id: 'job-1',
        data: { inforId: 'info-1' },
        getState: jest.fn().mockResolvedValue('completed'),
        progress: 100,
        failedReason: undefined,
        processedOn: 1000,
        finishedOn: 2000,
      } as any);

      const result = await service.getJobStatus('job-1');

      expect(result).toEqual(
        expect.objectContaining({
          jobId: 'job-1',
          inforId: 'info-1',
          status: 'completed',
          progress: 100,
        }),
      );
    });

    it('rethrows when fetching the job fails', async () => {
      queue.getJob.mockRejectedValue(new Error('queue error'));

      await expect(service.getJobStatus('job-1')).rejects.toThrow(
        'queue error',
      );
    });
  });

  describe('removeJob', () => {
    it('does nothing when the job is not found', async () => {
      queue.getJob.mockResolvedValue(undefined);

      await expect(service.removeJob('job-1')).resolves.toBeUndefined();
    });

    it('removes the job when it exists', async () => {
      const remove = jest.fn().mockResolvedValue(undefined);
      queue.getJob.mockResolvedValue({ remove } as any);

      await service.removeJob('job-1');

      expect(remove).toHaveBeenCalled();
    });

    it('rethrows when removing the job fails', async () => {
      queue.getJob.mockRejectedValue(new Error('queue error'));

      await expect(service.removeJob('job-1')).rejects.toThrow('queue error');
    });
  });
});
