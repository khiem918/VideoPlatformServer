import { VideoResolver } from './video.resolver';
import { VideoService } from './video.service';
import { ConfigService } from '@nestjs/config';

describe('VideoResolver', () => {
  let resolver: VideoResolver;
  let videoService: jest.Mocked<VideoService>;
  let config: jest.Mocked<ConfigService>;

  beforeEach(() => {
    videoService = {
      initUpload: jest.fn(),
      completeUpload: jest.fn(),
      deleteVideo: jest.fn(),
      getUserVideos: jest.fn(),
      updateVideo: jest.fn(),
      getWatchVideoMetadata: jest.fn(),
      getWatchVideoUrl: jest.fn(),
      commentOnVideo: jest.fn(),
      getVideoComments: jest.fn(),
      updateVideoHistory: jest.fn(),
      likeOrDislikeVideo: jest.fn(),
      subscribeChannel: jest.fn(),
      trackVideoWatchProgress: jest.fn(),
    } as unknown as jest.Mocked<VideoService>;

    config = {
      get: jest.fn().mockReturnValue('.example.com'),
    } as unknown as jest.Mocked<ConfigService>;

    resolver = new VideoResolver(videoService, config);
  });

  it('initUploadVideo returns the videoId and presignedUrl from the service', async () => {
    videoService.initUpload.mockResolvedValue({
      videoId: 'video-1',
      presignedUrl: 'https://upload',
      objectPath: 'videos/aa/bb/video-1/original/file.mp4',
    });

    const result = await resolver.initUploadVideo(
      { userId: 'user-1' },
      'file.mp4',
      100,
      'video/mp4',
    );

    expect(videoService.initUpload).toHaveBeenCalledWith(
      'user-1',
      'file.mp4',
      'video/mp4',
      100,
    );
    expect(result).toEqual({
      videoId: 'video-1',
      presignedUrl: 'https://upload',
    });
  });

  it('completeUploadVideo delegates to the service and returns true', async () => {
    const result = await resolver.completeUploadVideo(
      { userId: 'user-1' },
      'upload-1',
    );

    expect(videoService.completeUpload).toHaveBeenCalledWith(
      'user-1',
      'upload-1',
    );
    expect(result).toBe(true);
  });

  it('deleteVideoUpload delegates to the service and returns true', async () => {
    const result = await resolver.deleteVideoUpload(
      { userId: 'user-1' },
      'upload-1',
    );

    expect(videoService.deleteVideo).toHaveBeenCalledWith('user-1', 'upload-1');
    expect(result).toBe(true);
  });

  it('getUserVideos returns the service result', async () => {
    videoService.getUserVideos.mockResolvedValue({
      total: 0,
      videos: [],
    } as any);

    const result = await resolver.getUserVideos({ userId: 'user-1' });

    expect(videoService.getUserVideos).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ total: 0, videos: [] });
  });

  it('updateVideo forwards all fields to the service', async () => {
    videoService.updateVideo.mockResolvedValue({ id: 'video-1' } as any);

    const result = await resolver.updateVideo(
      { userId: 'user-1' },
      'video-1',
      'title',
      ['tag'],
      'desc',
      'PUBLIC',
    );

    expect(videoService.updateVideo).toHaveBeenCalledWith(
      'user-1',
      'video-1',
      'title',
      ['tag'],
      'desc',
      'PUBLIC',
    );
    expect(result).toEqual({ id: 'video-1' });
  });

  it('deleteVideo delegates to the service and returns true', async () => {
    const result = await resolver.deleteVideo({ userId: 'user-1' }, 'video-1');

    expect(videoService.deleteVideo).toHaveBeenCalledWith('user-1', 'video-1');
    expect(result).toBe(true);
  });

  it('getWatchVideoMetadata delegates to the service', async () => {
    videoService.getWatchVideoMetadata.mockResolvedValue({
      id: 'video-1',
    } as any);

    const result = await resolver.getWatchVideoMetadata('video-1', {
      userId: 'user-1',
    });

    expect(videoService.getWatchVideoMetadata).toHaveBeenCalledWith(
      'video-1',
      'user-1',
    );
    expect(result).toEqual({ id: 'video-1' });
  });

  it('getWatchVideoUrl delegates to the service and sets signed cookies', async () => {
    videoService.getWatchVideoUrl.mockResolvedValue({
      mpdUrl:
        'https://cdn.example.com/private/user/video-1/segment/manifest.mpd',
      cookies: {
        'CloudFront-Policy': 'policy',
        'CloudFront-Key-Pair-Id': 'key-pair-id',
        'CloudFront-Signature': 'signature',
      },
    } as any);

    const res = { cookie: jest.fn() } as any;

    const result = await resolver.getWatchVideoUrl(
      'video-1',
      { userId: 'user-1' },
      res,
    );

    expect(videoService.getWatchVideoUrl).toHaveBeenCalledWith(
      'user-1',
      'video-1',
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'CF_P',
      'policy',
      expect.objectContaining({ domain: '.example.com', path: '/private/' }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'CF_K',
      'key-pair-id',
      expect.objectContaining({ domain: '.example.com', path: '/private/' }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'CF_S',
      'signature',
      expect.objectContaining({ domain: '.example.com', path: '/private/' }),
    );
    expect(result).toEqual({
      mpdUrl:
        'https://cdn.example.com/private/user/video-1/segment/manifest.mpd',
    });
  });

  it('commentOnVideo delegates to the service', async () => {
    videoService.commentOnVideo.mockResolvedValue({ id: '1' } as any);

    const result = await resolver.commentOnVideo(
      'video-1',
      { userId: 'user-1' },
      'hi',
    );

    expect(videoService.commentOnVideo).toHaveBeenCalledWith(
      'video-1',
      'user-1',
      'hi',
    );
    expect(result).toEqual({ id: '1' });
  });

  it('getVideoComments builds a cursor when both cursor arguments are present', async () => {
    videoService.getVideoComments.mockResolvedValue([]);
    const createdAt = new Date('2024-01-01T00:00:00Z');

    await resolver.getVideoComments('video-1', createdAt, 'comment-1');

    expect(videoService.getVideoComments).toHaveBeenCalledWith('video-1', {
      createdAt,
      id: 'comment-1',
    });
  });

  it('getVideoComments omits the cursor when either argument is missing', async () => {
    videoService.getVideoComments.mockResolvedValue([]);

    await resolver.getVideoComments('video-1');

    expect(videoService.getVideoComments).toHaveBeenCalledWith(
      'video-1',
      undefined,
    );
  });

  it('updateVideoHistory delegates to the service and returns true', async () => {
    const result = await resolver.updateVideoHistory(
      { userId: 'user-1' },
      'video-1',
    );

    expect(videoService.updateVideoHistory).toHaveBeenCalledWith(
      'user-1',
      'video-1',
    );
    expect(result).toBe(true);
  });

  it('likeOrDislikeVideo delegates to the service', async () => {
    videoService.likeOrDislikeVideo.mockResolvedValue({
      likeCount: 1,
      dislikeCount: 0,
    });

    const result = await resolver.likeOrDislikeVideo(
      'video-1',
      { userId: 'user-1' },
      true,
    );

    expect(videoService.likeOrDislikeVideo).toHaveBeenCalledWith(
      'user-1',
      'video-1',
      true,
    );
    expect(result).toEqual({ likeCount: 1, dislikeCount: 0 });
  });

  it('subscribeChannel delegates to the service', async () => {
    videoService.subscribeChannel.mockResolvedValue({
      subscriberCount: 5,
      isSubscribe: true,
    });

    const result = await resolver.subscribeChannel(
      'channel-1',
      { userId: 'user-1' },
      true,
    );

    expect(videoService.subscribeChannel).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      true,
    );
    expect(result).toEqual({ subscriberCount: 5, isSubscribe: true });
  });

  it('trackVideoWatchProgress delegates to the service and returns true', async () => {
    const result = await resolver.trackVideoWatchProgress(
      'video-1',
      { userId: 'user-1' },
      42,
    );

    expect(videoService.trackVideoWatchProgress).toHaveBeenCalledWith(
      'user-1',
      'video-1',
      42,
    );
    expect(result).toBe(true);
  });
});
