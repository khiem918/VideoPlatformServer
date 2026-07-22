import { VideoProcessingHandler } from './video-processing.handler';
import { VideoProcessingService } from './video-processing.service';
import { InvalidVideoException } from './exceptions/invalid-video.exception';

describe('VideoProcessingHandler', () => {
  let handler: VideoProcessingHandler;
  let processingService: jest.Mocked<VideoProcessingService>;

  function createJob(name: string, data: unknown) {
    return {
      name,
      data,
      updateProgress: jest.fn(),
    } as any;
  }

  beforeEach(() => {
    processingService = {
      transcodeVideo: jest.fn(),
    } as unknown as jest.Mocked<VideoProcessingService>;

    handler = new VideoProcessingHandler(processingService);
  });

  it('throws InvalidVideoException when the job name is unexpected', async () => {
    const job = createJob('unexpected-job', {});

    await expect(handler.process(job)).rejects.toThrow(InvalidVideoException);
    expect(processingService.transcodeVideo).not.toHaveBeenCalled();
  });

  it('throws InvalidVideoException when job data is not an object', async () => {
    const job = createJob('transcode-video', null);

    await expect(handler.process(job)).rejects.toThrow(InvalidVideoException);
  });

  it('throws InvalidVideoException when required fields are missing', async () => {
    const job = createJob('transcode-video', {
      processingId: 'proc-1',
      inforId: 'info-1',
    });

    await expect(handler.process(job)).rejects.toThrow(InvalidVideoException);
  });

  it('throws InvalidVideoException when the mime type is unsupported', async () => {
    const job = createJob('transcode-video', {
      processingId: 'proc-1',
      inforId: 'info-1',
      objectPath: 'r2/path',
      mimeType: 'video/unsupported',
    });

    await expect(handler.process(job)).rejects.toThrow(InvalidVideoException);
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

    await handler.process(job);

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
