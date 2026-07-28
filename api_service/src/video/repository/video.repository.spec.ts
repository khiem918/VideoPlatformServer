import { VideoRepository } from './video.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ProcessingStatus,
  ProcessingType,
  UploadVideoStatus,
  UploadMetaStatus,
} from '@prisma/client';

function createTxMock() {
  return {
    video: { create: jest.fn(), update: jest.fn() },
    videoInformation: { create: jest.fn() },
    watchHistory: { upsert: jest.fn() },
  };
}

function createPrismaMock(tx: ReturnType<typeof createTxMock>) {
  return {
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    video: {
      findMany: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    videoInformation: { update: jest.fn() },
    videoProcessing: { create: jest.fn() },
    likeVideo: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    subscribe: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    },
    watchHistory: { upsert: jest.fn() },
    comment: { findMany: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
  };
}

describe('VideoRepository', () => {
  let repository: VideoRepository;
  let prisma: ReturnType<typeof createPrismaMock>;
  let tx: ReturnType<typeof createTxMock>;

  beforeEach(() => {
    tx = createTxMock();
    prisma = createPrismaMock(tx);

    repository = new VideoRepository(prisma as unknown as PrismaService);
  });

  it('initVideoUpload creates a video and pending video information in a transaction', async () => {
    await repository.initVideoUpload(
      'user-1',
      'video-1',
      'file.mp4',
      100,
      'r2/path',
      'video/mp4',
    );

    expect(tx.video.create).toHaveBeenCalledWith({
      data: { id: 'video-1', userId: 'user-1' },
    });
    expect(tx.videoInformation.create).toHaveBeenCalledWith({
      data: {
        videoId: 'video-1',
        fileName: 'file.mp4',
        fileSize: 100,
        objectPath: 'r2/path',
        mimeType: 'video/mp4',
        videoStatus: UploadVideoStatus.PENDING,
      },
    });
  });

  it('updateVideoInfo only includes defined fields in the update payload', async () => {
    prisma.videoInformation.update.mockResolvedValue({ id: 'info-1' });

    await repository.updateVideoInfo('video-1', undefined, 'renamed.mp4');

    expect(prisma.videoInformation.update).toHaveBeenCalledWith({
      where: { videoId: 'video-1' },
      data: { fileName: 'renamed.mp4' },
    });
  });

  it('updateVideoInfo writes videoMetaStatus onto the metaStatus column', async () => {
    prisma.videoInformation.update.mockResolvedValue({ id: 'info-1' });

    await repository.updateVideoInfo(
      'video-1',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      UploadMetaStatus.PROCESSING,
    );

    expect(prisma.videoInformation.update).toHaveBeenCalledWith({
      where: { videoId: 'video-1' },
      data: { metaStatus: UploadMetaStatus.PROCESSING },
    });
  });

  it('createVideoProcessing creates a processing record with PROCESSING status', async () => {
    prisma.videoProcessing.create.mockResolvedValue({ id: 'proc-1' });

    await repository.createVideoProcessing('info-1', ProcessingType.VIDEO);

    expect(prisma.videoProcessing.create).toHaveBeenCalledWith({
      data: {
        videoInformationId: 'info-1',
        processingType: ProcessingType.VIDEO,
        status: ProcessingStatus.PROCESSING,
      },
    });
  });

  it('createVideoProcessing uses the provided id when given', async () => {
    prisma.videoProcessing.create.mockResolvedValue({ id: 'proc-1' });

    await repository.createVideoProcessing(
      'info-1',
      ProcessingType.META,
      'proc-1',
    );

    expect(prisma.videoProcessing.create).toHaveBeenCalledWith({
      data: {
        id: 'proc-1',
        videoInformationId: 'info-1',
        processingType: ProcessingType.META,
        status: ProcessingStatus.PROCESSING,
      },
    });
  });

  it('getUserAllVideos returns videos ordered by newest first', async () => {
    prisma.video.findMany.mockResolvedValue([{ id: 'video-1' }]);

    const result = await repository.getUserAllVideos('user-1');

    expect(prisma.video.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
    expect(result).toEqual([{ id: 'video-1' }]);
  });

  it('findVideo scopes the lookup by userId only when provided', async () => {
    prisma.video.findUnique.mockResolvedValue({ id: 'video-1' });

    await repository.findVideo('video-1');

    expect(prisma.video.findUnique).toHaveBeenCalledWith({
      where: { id: 'video-1' },
      include: { information: true },
    });
  });

  it('getVideoForWatching returns null when the video does not exist', async () => {
    prisma.video.findUnique.mockResolvedValue(null);
    prisma.likeVideo.findUnique.mockResolvedValue(null);
    prisma.subscribe.findUnique.mockResolvedValue(null);

    const result = await repository.getVideoForWatching('user-1', 'video-1');

    expect(result).toBeNull();
  });

  it('getVideoForWatching aggregates video, like, and subscription state', async () => {
    prisma.video.findUnique.mockResolvedValue({
      id: 'video-1',
      userId: 'owner-1',
    });
    prisma.likeVideo.findUnique.mockResolvedValue({ isLike: true });
    prisma.subscribe.findUnique.mockResolvedValue({ userId: 'user-1' });

    const result = await repository.getVideoForWatching('user-1', 'video-1');

    expect(result).toEqual({
      res1: { id: 'video-1', userId: 'owner-1' },
      res2: { isLike: true },
      res3: { userId: 'user-1' },
    });
  });

  it('likeOrDislikeVideo returns unchanged counts when the same reaction is repeated', async () => {
    prisma.likeVideo.findUnique.mockResolvedValue({ isLike: true });
    prisma.video.findUnique.mockResolvedValue({
      videoLike: 5,
      videoDislike: 1,
    });

    const result = await repository.likeOrDislikeVideo(
      'user-1',
      'video-1',
      true,
    );

    expect(prisma.likeVideo.update).not.toHaveBeenCalled();
    expect(prisma.likeVideo.create).not.toHaveBeenCalled();
    expect(result).toEqual({ videoLike: 5, videoDislike: 1 });
  });

  it('likeOrDislikeVideo flips the reaction and adjusts both counters', async () => {
    prisma.likeVideo.findUnique.mockResolvedValue({ isLike: false });
    prisma.video.update.mockResolvedValue({ videoLike: 6, videoDislike: 0 });

    await repository.likeOrDislikeVideo('user-1', 'video-1', true);

    expect(prisma.likeVideo.update).toHaveBeenCalledWith({
      where: { userId_videoId: { userId: 'user-1', videoId: 'video-1' } },
      data: { isLike: true },
    });
    expect(prisma.video.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          videoLike: { increment: 1 },
          videoDislike: { decrement: 1 },
        },
      }),
    );
  });

  it('likeOrDislikeVideo creates a new reaction when none exists', async () => {
    prisma.likeVideo.findUnique.mockResolvedValue(null);
    prisma.video.update.mockResolvedValue({ videoLike: 1, videoDislike: 0 });

    await repository.likeOrDislikeVideo('user-1', 'video-1', true);

    expect(prisma.likeVideo.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', videoId: 'video-1', isLike: true },
    });
  });

  it('subscribeChannel returns the current count when already subscribed', async () => {
    prisma.subscribe.findUnique.mockResolvedValue({ userId: 'user-1' });
    prisma.user.findUnique.mockResolvedValue({ subscribeCount: 10 });

    const result = await repository.subscribeChannel(
      'user-1',
      'channel-1',
      true,
    );

    expect(prisma.subscribe.delete).not.toHaveBeenCalled();
    expect(result).toEqual({ subscribeCount: 10 });
  });

  it('subscribeChannel removes the subscription and decrements the count', async () => {
    prisma.subscribe.findUnique.mockResolvedValue({ userId: 'user-1' });
    prisma.user.update.mockResolvedValue({ subscribeCount: 9 });

    const result = await repository.subscribeChannel(
      'user-1',
      'channel-1',
      false,
    );

    expect(prisma.subscribe.delete).toHaveBeenCalledWith({
      where: { userId_channelId: { userId: 'user-1', channelId: 'channel-1' } },
    });
    expect(result).toEqual({ subscribeCount: 9 });
  });

  it('subscribeChannel creates a new subscription and increments the count', async () => {
    prisma.subscribe.findUnique.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({ subscribeCount: 1 });

    await repository.subscribeChannel('user-1', 'channel-1', true);

    expect(prisma.subscribe.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', channelId: 'channel-1' },
    });
  });

  it('watchVideo upserts history and increments the view count in a transaction', async () => {
    await repository.watchVideo('user-1', 'video-1');

    expect(tx.watchHistory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_videoId: { userId: 'user-1', videoId: 'video-1' } },
      }),
    );
    expect(tx.video.update).toHaveBeenCalledWith({
      where: { id: 'video-1' },
      data: { videoView: { increment: 1 } },
    });
  });

  it('getVideoComments applies keyset pagination when a cursor is provided', async () => {
    prisma.comment.findMany.mockResolvedValue([]);
    const cursor = {
      createdAt: new Date('2024-01-01T00:00:00Z'),
      id: 'comment-1',
    };

    await repository.getVideoComments('video-1', cursor);

    const whereMatcher: unknown = expect.objectContaining({
      videoId: 'video-1',
      parentId: null,
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ],
    });

    expect(prisma.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: whereMatcher }),
    );
  });
});
