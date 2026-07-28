import { Job } from 'bullmq';
import { VideoProcessingHandler } from './video-processing.handler';
import { VideoProcessingService } from './video-processing.service';
import { InvalidVideoException } from './exceptions/invalid-video.exception';

interface MockJob {
  name: string;
  data: unknown;
  updateProgress: jest.Mock;
}

function createProcessingServiceMock() {
  return {
    transcodeVideo: jest.fn(),
  };
}

describe('VideoProcessingHandler', () => {
  let handler: VideoProcessingHandler;
  let processingService: ReturnType<typeof createProcessingServiceMock>;

  function createJob(name: string, data: unknown): MockJob {
    return {
      name,
      data,
      updateProgress: jest.fn(),
    };
  }

  beforeEach(() => {
    processingService = createProcessingServiceMock();

    handler = new VideoProcessingHandler(
      processingService as unknown as VideoProcessingService,
    );
  });

  it('throws InvalidVideoException when the job name is unexpected', async () => {
    const job = createJob('unexpected-job', {});

    await expect(handler.process(job as unknown as Job)).rejects.toThrow(
      InvalidVideoException,
    );
    expect(processingService.transcodeVideo).not.toHaveBeenCalled();
  });

  it('throws InvalidVideoException when job data is not an object', async () => {
    const job = createJob('transcode-video', null);

    await expect(handler.process(job as unknown as Job)).rejects.toThrow(
      InvalidVideoException,
    );
  });

  it('throws InvalidVideoException when required fields are missing', async () => {
    const job = createJob('transcode-video', {
      processingId: 'proc-1',
      inforId: 'info-1',
    });

    await expect(handler.process(job as unknown as Job)).rejects.toThrow(
      InvalidVideoException,
    );
  });

  it('throws InvalidVideoException when the mime type is unsupported', async () => {
    const job = createJob('transcode-video', {
      processingId: 'proc-1',
      inforId: 'info-1',
      objectPath: 'r2/path',
      mimeType: 'video/unsupported',
    });

    await expect(handler.process(job as unknown as Job)).rejects.toThrow(
      InvalidVideoException,
    );
  });

  it('transcodes the video and reports progress for a valid job', async () => {
    const job = createJob('transcode-video', {
      processingId: 'proc-1',
      inforId: 'info-1',
      objectPath: 'r2/path',
      mimeType: 'video/mp4',
    });
    processingService.transcodeVideo.mockResolvedValue({
      manifestPath: 'manifest',
      thumbnailPath: 'thumb',
    });

    await handler.process(job as unknown as Job);

    expect(job.updateProgress).toHaveBeenCalledWith(10);
    expect(processingService.transcodeVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        processingId: 'proc-1',
        mimeType: 'video/mp4',
      }),
    );
    expect(job.updateProgress).toHaveBeenCalledWith(90);
  });
});
