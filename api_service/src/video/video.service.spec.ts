/// <reference types="jest" />

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  UploadVideoStatus,
  VideoStatus,
  VideoVisibility,
} from '@prisma/client';
import { VideoService } from './video.service';
import { S3Service } from 'src/s3/s3.service';
import { VideoRepository } from './repository/video.repository';
import { VideoProcessingQueueService } from '../video-processing/video-processing.queue';
import { QdrantService } from 'src/qdrant/qdrant.service';
import { PublisherService } from 'src/rabbitmq/publisher.service';
import { GrpcClientService } from 'src/grpc/client/grpc-client.service';

describe('VideoService', () => {
  let service: VideoService;
  let s3Service: jest.Mocked<S3Service>;
  let videorepository: jest.Mocked<VideoRepository>;
  let videoProcessingQueueService: jest.Mocked<VideoProcessingQueueService>;
  let qdrantService: jest.Mocked<QdrantService>;
  let publisherService: jest.Mocked<PublisherService>;
  let grpcClientService: jest.Mocked<GrpcClientService>;

  beforeEach(() => {
    s3Service = {
      getPresignedUploadUrl: jest.fn(),
      fileExists: jest.fn(),
      deleteDirectory: jest.fn(),
      getPresignedDownloadUrl: jest.fn(),
      generatePublicResourceUrl: jest.fn(),
      generateCookieToGetVideo: jest.fn(),
      buildPrivatePrefix: jest.fn(
        (videoId: string) => `private/user/${videoId}/`,
      ),
      buildPublicPrefix: jest.fn(
        (videoId: string) => `public/user/${videoId}/`,
      ),
    } as unknown as jest.Mocked<S3Service>;

    videorepository = {
      initVideoUpload: jest.fn(),
      findVideo: jest.fn(),
      createVideoProcessing: jest.fn(),
      updateVideoInfo: jest.fn(),
      deleteVideo: jest.fn(),
      getUserAllVideos: jest.fn(),
      updateVideo: jest.fn(),
      getVideoForWatching: jest.fn(),
      watchVideo: jest.fn(),
      getVideoComments: jest.fn(),
      createComment: jest.fn(),
      updateHistory: jest.fn(),
      likeOrDislikeVideo: jest.fn(),
      subscribeChannel: jest.fn(),
    } as unknown as jest.Mocked<VideoRepository>;

    videoProcessingQueueService = {
      addTranscodingJob: jest.fn(),
    } as unknown as jest.Mocked<VideoProcessingQueueService>;

    qdrantService = {
      deleteVideoVector: jest.fn(),
    } as unknown as jest.Mocked<QdrantService>;

    publisherService = {
      transferVideoMetadata: jest.fn(),
    } as unknown as jest.Mocked<PublisherService>;

    grpcClientService = {
      deleteVideo: jest.fn(),
    } as unknown as jest.Mocked<GrpcClientService>;

    service = new VideoService(
      s3Service,
      videorepository,
      videoProcessingQueueService,
      qdrantService,
      publisherService,
      grpcClientService,
    );
  });

  describe('initUpload', () => {
    it('throws BadRequestException for an unsupported mime type', async () => {
      await expect(
        service.initUpload('user-1', 'file.txt', 'text/plain', 100),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the file exceeds the maximum size', async () => {
      await expect(
        service.initUpload('user-1', 'file.mp4', 'video/mp4', 20 * 1024 ** 3),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns upload metadata and persists the pending upload', async () => {
      s3Service.getPresignedUploadUrl.mockResolvedValue({
        presignedUrl: 'https://upload',
        objectPath: 'videos/aa/bb/video-1/original/file.mp4',
      });

      const result = await service.initUpload(
        'user-1',
        'file.mp4',
        'video/mp4',
        100,
      );

      expect(videorepository.initVideoUpload).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
        'file.mp4',
        100,
        'videos/aa/bb/video-1/original/file.mp4',
        'video/mp4',
      );
      expect(result.presignedUrl).toBe('https://upload');
      expect(result.objectPath).toBe('videos/aa/bb/video-1/original/file.mp4');
      expect(typeof result.videoId).toBe('string');
    });
  });

  describe('completeUpload', () => {
    it('throws NotFoundException when the video is not owned by the user', async () => {
      videorepository.findVideo.mockResolvedValue({
        userId: 'someone-else',
      } as any);

      await expect(service.completeUpload('user-1', 'video-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the upload is not pending', async () => {
      videorepository.findVideo.mockResolvedValue({
        userId: 'user-1',
        information: { videoStatus: UploadVideoStatus.UPLOADED },
      } as any);

      await expect(service.completeUpload('user-1', 'video-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when the uploaded file does not exist in storage', async () => {
      videorepository.findVideo.mockResolvedValue({
        userId: 'user-1',
        information: {
          videoStatus: UploadVideoStatus.PENDING,
          objectPath: 'videos/aa/bb/video-1/original/file.mp4',
        },
      } as any);
      s3Service.fileExists.mockResolvedValue(false);

      await expect(service.completeUpload('user-1', 'video-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('marks the upload as uploaded and enqueues a transcoding job', async () => {
      videorepository.findVideo.mockResolvedValue({
        userId: 'user-1',
        information: {
          id: 'info-1',
          videoStatus: UploadVideoStatus.PENDING,
          objectPath: 'videos/aa/bb/video-1/original/file.mp4',
          mimeType: 'video/mp4',
        },
      } as any);
      s3Service.fileExists.mockResolvedValue(true);
      videorepository.createVideoProcessing.mockResolvedValue({
        id: 'proc-1',
      } as any);
      videorepository.updateVideoInfo.mockResolvedValue({} as any);

      await service.completeUpload('user-1', 'video-1');

      expect(
        videoProcessingQueueService.addTranscodingJob,
      ).toHaveBeenCalledWith({
        processingId: 'proc-1',
        inforId: 'info-1',
        objectPath: 'videos/aa/bb/video-1/original/file.mp4',
        mimeType: 'video/mp4',
      });
    });
  });

  describe('deleteVideo', () => {
    it('throws NotFoundException when the video does not exist', async () => {
      videorepository.findVideo.mockResolvedValue(null);

      await expect(service.deleteVideo('user-1', 'video-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('removes storage, vector, database record, and search index entry', async () => {
      videorepository.findVideo.mockResolvedValue({
        videoUrl: 'https://cdn/private/user/video-1/segment/manifest.mpd',
      } as any);
      s3Service.deleteDirectory.mockResolvedValue(undefined);
      qdrantService.deleteVideoVector.mockResolvedValue(undefined);
      videorepository.deleteVideo.mockResolvedValue(undefined as any);
      grpcClientService.deleteVideo.mockResolvedValue(undefined);

      await service.deleteVideo('user-1', 'video-1');

      expect(s3Service.deleteDirectory).toHaveBeenCalledWith(
        'private/user/video-1/',
      );
      expect(s3Service.deleteDirectory).toHaveBeenCalledWith(
        'public/user/video-1/',
      );
      expect(qdrantService.deleteVideoVector).toHaveBeenCalledWith('video-1');
      expect(videorepository.deleteVideo).toHaveBeenCalledWith(
        'user-1',
        'video-1',
      );
      expect(grpcClientService.deleteVideo).toHaveBeenCalledWith('video-1');
    });

    it('throws NotFoundException when a downstream deletion fails', async () => {
      videorepository.findVideo.mockResolvedValue({ videoUrl: null } as any);
      s3Service.deleteDirectory.mockRejectedValue(new Error('s3 error'));

      await expect(service.deleteVideo('user-1', 'video-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getUserVideos', () => {
    it('masks draft video details and returns presigned thumbnail urls', async () => {
      videorepository.getUserAllVideos.mockResolvedValue([
        {
          id: 'video-1',
          videoName: 'draft video',
          duration: 10,
          videoUrl: 'url',
          thumbnailUrl: 'thumb.jpg',
          videoView: 5,
          videoLike: 1,
          videoDislike: 0,
          visibility: 'DRAFT',
          videoDesc: 'desc',
          videoHashtags: [{ displayTag: 'tag' }],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any);
      s3Service.getPresignedDownloadUrl.mockResolvedValue(
        'https://signed-thumb',
      );

      const result = await service.getUserVideos('user-1');

      expect(result.total).toBe(1);
      const [video] = await result.videos;
      expect(video.videoName).toBe('draft');
      expect(video.videoUrl).toBeNull();
      expect(video.thumbnailUrl).toBeNull();
      expect(video.tags).toEqual([]);
    });

    it('keeps thumbnail as-is when the presigned url generation fails', async () => {
      videorepository.getUserAllVideos.mockResolvedValue([
        {
          id: 'video-1',
          videoName: 'public video',
          duration: 10,
          videoPath: 'url',
          thumbnailPath: 'thumb.jpg',
          videoView: 5,
          videoLike: 1,
          videoDislike: 0,
          visibility: 'PUBLIC',
          videoDesc: 'desc',
          videoHashtags: [{ displayTag: 'tag' }],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any);
      s3Service.generatePublicResourceUrl.mockImplementation(() => {
        throw new Error('s3 down');
      });

      const result = await service.getUserVideos('user-1');
      const [video] = await result.videos;

      expect(video.thumbnailUrl).toBe('thumb.jpg');
    });
  });

  describe('updateVideo', () => {
    it('throws NotFoundException when the video is not owned by the user', async () => {
      videorepository.findVideo.mockResolvedValue(null);

      await expect(
        service.updateVideo('user-1', 'video-1', 'title'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when no title is provided or already set', async () => {
      videorepository.findVideo.mockResolvedValue({
        userId: 'user-1',
        videoName: null,
      } as any);

      await expect(service.updateVideo('user-1', 'video-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('keeps visibility as DRAFT while the video is still processing', async () => {
      videorepository.findVideo.mockResolvedValue({
        userId: 'user-1',
        videoName: 'existing title',
        videoStatus: VideoStatus.PROCESSING,
        visibility: VideoVisibility.DRAFT,
      } as any);
      videorepository.updateVideo.mockResolvedValue({
        id: 'video-1',
        videoName: 'new title',
        duration: 10,
        videoUrl: null,
        thumbnailUrl: null,
        videoView: 0,
        videoLike: 0,
        videoDislike: 0,
        visibility: VideoVisibility.DRAFT,
        videoDesc: 'desc',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      await service.updateVideo('user-1', 'video-1', 'new title');

      expect(videorepository.updateVideo).toHaveBeenCalledWith(
        'user-1',
        'video-1',
        'new title',
        undefined,
        VideoVisibility.DRAFT,
      );
    });

    it('throws NotFoundException when the update does not affect any row', async () => {
      videorepository.findVideo.mockResolvedValue({
        userId: 'user-1',
        videoName: 'existing title',
        videoStatus: VideoStatus.AVAILABLE,
        visibility: VideoVisibility.PUBLIC,
      } as any);
      videorepository.updateVideo.mockResolvedValue(null as any);

      await expect(
        service.updateVideo('user-1', 'video-1', 'new title'),
      ).rejects.toThrow(NotFoundException);
    });

    it('publishes metadata changes and returns the updated video', async () => {
      videorepository.findVideo.mockResolvedValue({
        userId: 'user-1',
        videoName: 'existing title',
        videoStatus: VideoStatus.AVAILABLE,
        visibility: VideoVisibility.PUBLIC,
      } as any);
      videorepository.updateVideo.mockResolvedValue({
        id: 'video-1',
        videoName: 'new title',
        duration: 10,
        videoPath: 'url',
        thumbnailPath: 'thumb.jpg',
        videoView: 1,
        videoLike: 2,
        videoDislike: 3,
        visibility: VideoVisibility.PUBLIC,
        videoDesc: 'desc',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      s3Service.generatePublicResourceUrl.mockReturnValue(
        'https://signed-thumb',
      );

      const result = await service.updateVideo(
        'user-1',
        'video-1',
        'new title',
        ['tag1'],
        'new desc',
        'PUBLIC',
      );

      expect(publisherService.transferVideoMetadata).toHaveBeenCalledWith(
        'video-1',
        'new title',
        'new desc',
        ['tag1'],
      );
      expect(result.thumbnailUrl).toBe('https://signed-thumb');
      expect(result.tags).toEqual(['tag1']);
    });
  });

  describe('getWatchVideoMetadata', () => {
    it('throws NotFoundException when processing is not complete', async () => {
      videorepository.getVideoForWatching.mockResolvedValue({
        res1: { videoPath: null },
      } as any);

      await expect(
        service.getWatchVideoMetadata('video-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when a private video is viewed by another user', async () => {
      videorepository.getVideoForWatching.mockResolvedValue({
        res1: { videoUrl: 'url', userId: 'owner-1', visibility: 'PRIVATE' },
      } as any);

      await expect(
        service.getWatchVideoMetadata('video-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when a draft video is viewed by another user', async () => {
      videorepository.getVideoForWatching.mockResolvedValue({
        res1: { videoUrl: 'url', userId: 'owner-1', visibility: 'DRAFT' },
      } as any);

      await expect(
        service.getWatchVideoMetadata('video-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns the enriched watch metadata for a public video', async () => {
      videorepository.getVideoForWatching.mockResolvedValue({
        res1: {
          id: 'video-1',
          videoName: 'name',
          duration: 10,
          videoView: 4,
          videoLike: 2,
          videoDislike: 1,
          videoDesc: 'desc',
          videoHashtags: [{ displayTag: 'tag' }],
          userId: 'owner-1',
          owner: { userName: 'owner name', subscribeCount: 3 },
          createdAt: new Date(),
          visibility: 'PUBLIC',
        },
        res2: { isLike: true },
        res3: { userId: 'user-1', channelId: 'owner-1' },
      } as any);

      const result = await service.getWatchVideoMetadata('video-1', 'user-1');

      expect(videorepository.watchVideo).toHaveBeenCalledWith(
        'user-1',
        'video-1',
      );
      expect(result.videoView).toBe(5);
      expect(result.isSubscribe).toBe(true);
      expect(result.isLiked).toBe(true);
      expect(result.isDisliked).toBe(false);
      expect(result.ownerName).toBe('owner name');
    });

    it('falls back to the owner id when the owner has no username', async () => {
      videorepository.getVideoForWatching.mockResolvedValue({
        res1: {
          id: 'video-1',
          videoName: 'name',
          duration: 10,
          videoView: 4,
          videoLike: 2,
          videoDislike: 1,
          videoDesc: null,
          videoHashtags: [],
          userId: 'owner-1',
          owner: { userName: null, subscribeCount: 0 },
          createdAt: new Date(),
          visibility: 'PUBLIC',
        },
        res2: null,
        res3: null,
      } as any);

      const result = await service.getWatchVideoMetadata('video-1', 'user-1');

      expect(result.ownerName).toBe('owner-1');
      expect(result.isSubscribe).toBe(false);
      expect(result.isLiked).toBe(false);
      expect(result.isDisliked).toBe(false);
    });
  });

  describe('getWatchVideoUrl', () => {
    it('throws NotFoundException when the video has no path yet', async () => {
      videorepository.findVideo.mockResolvedValue({ videoPath: null } as any);

      await expect(
        service.getWatchVideoUrl('user-1', 'video-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for a private video owned by someone else', async () => {
      videorepository.findVideo.mockResolvedValue({
        videoPath: 'private/user/video-1/segment/manifest.mpd',
        userId: 'owner-1',
        visibility: 'PRIVATE',
      } as any);

      await expect(
        service.getWatchVideoUrl('user-1', 'video-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns a signed manifest url for a public video', async () => {
      videorepository.findVideo.mockResolvedValue({
        videoPath: 'private/user/video-1/segment/manifest.mpd',
        userId: 'owner-1',
        visibility: 'PUBLIC',
      } as any);
      s3Service.generateCookieToGetVideo.mockResolvedValue({
        url: 'https://cdn.example.com/private/user/video-1/segment/manifest.mpd',
        cookies: {
          'CloudFront-Key-Pair-Id': 'key-pair-id',
          'CloudFront-Policy': 'policy',
          'CloudFront-Signature': 'signature',
        },
      });

      const result = await service.getWatchVideoUrl('user-1', 'video-1');

      expect(result.mpdUrl).toBe(
        'https://cdn.example.com/private/user/video-1/segment/manifest.mpd',
      );
      expect(result.cookies).toEqual({
        'CloudFront-Key-Pair-Id': 'key-pair-id',
        'CloudFront-Policy': 'policy',
        'CloudFront-Signature': 'signature',
      });
    });
  });

  describe('getVideoComments', () => {
    it('maps comment records into response shape', async () => {
      videorepository.getVideoComments.mockResolvedValue([
        {
          id: 1n,
          content: 'nice video',
          createdAt: new Date(),
          likeCount: 2,
          replyCount: 0,
          user: { userName: 'commenter', id: 'user-2' },
        },
      ] as any);

      const result = await service.getVideoComments('video-1');

      expect(result).toEqual([
        expect.objectContaining({
          id: '1',
          content: 'nice video',
          ownerName: 'commenter',
        }),
      ]);
    });
  });

  describe('commentOnVideo', () => {
    it('throws NotFoundException when the video does not exist', async () => {
      videorepository.findVideo.mockResolvedValue(null);

      await expect(
        service.commentOnVideo('video-1', 'user-1', 'hi'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when commenting on a private video', async () => {
      videorepository.findVideo.mockResolvedValue({
        visibility: 'PRIVATE',
      } as any);

      await expect(
        service.commentOnVideo('video-1', 'user-1', 'hi'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when commenting on a draft video', async () => {
      videorepository.findVideo.mockResolvedValue({
        visibility: 'DRAFT',
      } as any);

      await expect(
        service.commentOnVideo('video-1', 'user-1', 'hi'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates a comment and returns it in response shape', async () => {
      videorepository.findVideo.mockResolvedValue({
        visibility: 'PUBLIC',
      } as any);
      videorepository.createComment.mockResolvedValue({
        id: 5n,
        content: 'hi',
        createdAt: new Date(),
        user: { userName: 'commenter', id: 'user-1' },
      } as any);

      const result = await service.commentOnVideo('video-1', 'user-1', 'hi');

      expect(result).toEqual(
        expect.objectContaining({
          id: '5',
          content: 'hi',
          ownerName: 'commenter',
        }),
      );
    });

    it('wraps unexpected repository errors in BadRequestException', async () => {
      videorepository.findVideo.mockRejectedValue(new Error('db down'));

      await expect(
        service.commentOnVideo('video-1', 'user-1', 'hi'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateVideoHistory', () => {
    it('delegates to the repository', async () => {
      await service.updateVideoHistory('user-1', 'video-1', 30);

      expect(videorepository.updateHistory).toHaveBeenCalledWith(
        'user-1',
        'video-1',
        30,
      );
    });
  });

  describe('likeOrDislikeVideo', () => {
    it('throws NotFoundException when the video does not exist', async () => {
      videorepository.findVideo.mockResolvedValue(null);

      await expect(
        service.likeOrDislikeVideo('user-1', 'video-1', true),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for a private video', async () => {
      videorepository.findVideo.mockResolvedValue({
        visibility: 'PRIVATE',
      } as any);

      await expect(
        service.likeOrDislikeVideo('user-1', 'video-1', true),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when the like operation fails', async () => {
      videorepository.findVideo.mockResolvedValue({
        visibility: 'PUBLIC',
      } as any);
      videorepository.likeOrDislikeVideo.mockResolvedValue(null as any);

      await expect(
        service.likeOrDislikeVideo('user-1', 'video-1', true),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns updated like and dislike counts', async () => {
      videorepository.findVideo.mockResolvedValue({
        visibility: 'PUBLIC',
      } as any);
      videorepository.likeOrDislikeVideo.mockResolvedValue({
        videoLike: 3,
        videoDislike: 1,
      } as any);

      const result = await service.likeOrDislikeVideo(
        'user-1',
        'video-1',
        true,
      );

      expect(result).toEqual({ likeCount: 3, dislikeCount: 1 });
    });
  });

  describe('subscribeChannel', () => {
    it('throws BadRequestException when subscribing to your own channel', async () => {
      await expect(
        service.subscribeChannel('user-1', 'user-1', true),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the subscription operation fails', async () => {
      videorepository.subscribeChannel.mockResolvedValue(null as any);

      await expect(
        service.subscribeChannel('user-1', 'channel-1', true),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the updated subscriber count', async () => {
      videorepository.subscribeChannel.mockResolvedValue({
        subscribeCount: 42,
      } as any);

      const result = await service.subscribeChannel(
        'user-1',
        'channel-1',
        true,
      );

      expect(result).toEqual({ subscriberCount: 42, isSubscribe: true });
    });
  });

  describe('trackVideoWatchProgress', () => {
    it('throws NotFoundException when the video does not exist', async () => {
      videorepository.findVideo.mockResolvedValue(null);

      await expect(
        service.trackVideoWatchProgress('user-1', 'video-1', 10),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for a private video', async () => {
      videorepository.findVideo.mockResolvedValue({
        visibility: 'PRIVATE',
      } as any);

      await expect(
        service.trackVideoWatchProgress('user-1', 'video-1', 10),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException for a draft video', async () => {
      videorepository.findVideo.mockResolvedValue({
        visibility: 'DRAFT',
      } as any);

      await expect(
        service.trackVideoWatchProgress('user-1', 'video-1', 10),
      ).rejects.toThrow(ForbiddenException);
    });

    it('records watch progress for a public video', async () => {
      videorepository.findVideo.mockResolvedValue({
        visibility: 'PUBLIC',
      } as any);

      await service.trackVideoWatchProgress('user-1', 'video-1', 10);

      expect(videorepository.updateHistory).toHaveBeenCalledWith(
        'user-1',
        'video-1',
        10,
      );
    });
  });
});
