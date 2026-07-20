import * as path from 'path';
import { UploadMetaStatus, UploadVideoStatus } from '@prisma/client';
import { VideoProcessingService } from './video-processing.service';
import { FFmpegService } from './ffmpeg.service';
import { VideoProcessingRepository } from './repository/video-processing.repository';
import { S3Service } from 'src/s3/s3.service';
import { TranscodingFailedException } from './exceptions/transcoding-failed.exception';
import { InvalidVideoException } from './exceptions/invalid-video.exception';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  createWriteStream: jest.fn(),
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn(),
    rm: jest.fn(),
  },
}));
jest.mock('stream/promises', () => ({ pipeline: jest.fn() }));

import * as fs from 'fs';
import { pipeline } from 'stream/promises';

const fsMocks = fs as unknown as {
  existsSync: jest.Mock;
  mkdirSync: jest.Mock;
  createWriteStream: jest.Mock;
  promises: {
    mkdir: jest.Mock;
    writeFile: jest.Mock;
    readdir: jest.Mock;
    rm: jest.Mock;
  };
};

describe('VideoProcessingService', () => {
  const tempDir = '/tmp/video-processing';
  let service: VideoProcessingService;
  let ffmpegService: jest.Mocked<FFmpegService>;
  let repository: jest.Mocked<VideoProcessingRepository>;
  let s3Service: jest.Mocked<S3Service>;

  beforeEach(() => {
    jest.clearAllMocks();
    fsMocks.existsSync.mockReturnValue(true);
    fsMocks.createWriteStream.mockReturnValue({ write: jest.fn() });
    fsMocks.promises.mkdir.mockResolvedValue(undefined);
    fsMocks.promises.writeFile.mockResolvedValue(undefined);
    fsMocks.promises.rm.mockResolvedValue(undefined);
    (pipeline as jest.Mock).mockResolvedValue(undefined);

    ffmpegService = {
      getVideoMetadata: jest.fn(),
      transcodeToDASH: jest.fn(),
      extractThumbnail: jest.fn(),
    } as unknown as jest.Mocked<FFmpegService>;

    repository = {
      completeVideoProcessing: jest.fn(),
      recordFailure: jest.fn(),
      publicVideo: jest.fn(),
    } as unknown as jest.Mocked<VideoProcessingRepository>;

    s3Service = {
      getFileStream: jest.fn(),
      parseVideoIdFromPrivatePath: jest.fn(),
      buildPrivateSegmentPath: jest.fn(),
      buildPublicThumbnailPath: jest.fn(),
      uploadFileStream: jest.fn(),
    } as unknown as jest.Mocked<S3Service>;

    service = new VideoProcessingService(ffmpegService, repository, s3Service);
  });

  function mockArtifactDirectory(workDir: string) {
    const dashDir = path.join(workDir, 'dash');
    const thumbDir = path.join(workDir, 'thumb');

    fsMocks.promises.readdir.mockImplementation(async (dir: string) => {
      if (dir === workDir) {
        return [
          { name: 'dash', isDirectory: () => true },
          { name: 'thumb', isDirectory: () => true },
        ];
      }
      if (dir === dashDir) {
        return [{ name: 'manifest.mpd', isDirectory: () => false }];
      }
      if (dir === thumbDir) {
        return [{ name: '0.jpg', isDirectory: () => false }];
      }
      return [];
    });
  }

  describe('transcodeVideo', () => {
    it('transcodes a video, uploads artifacts, and publishes the video when processing completes', async () => {
      const workDir = path.join(tempDir, 'info-1');
      mockArtifactDirectory(workDir);

      s3Service.getFileStream.mockResolvedValue({} as any);
      ffmpegService.getVideoMetadata.mockResolvedValue({
        duration: 65.7,
        width: 1920,
        height: 1080,
        bitrate: '5000k',
      });
      ffmpegService.transcodeToDASH.mockResolvedValue({
        manifest: 'manifest.mpd',
      });
      ffmpegService.extractThumbnail.mockResolvedValue(undefined);
      s3Service.parseVideoIdFromPrivatePath.mockReturnValue('video-1');
      s3Service.buildPrivateSegmentPath.mockImplementation(
        (videoId: string, relativePath: string) =>
          `private/user/${videoId}/segment/${relativePath}`,
      );
      s3Service.buildPublicThumbnailPath.mockImplementation(
        (videoId: string, relativePath: string) =>
          `public/user/${videoId}/thumbnail/${relativePath}`,
      );
      s3Service.uploadFileStream.mockImplementation(
        async (_filePath: string, objectPath: string) => objectPath,
      );
      repository.completeVideoProcessing.mockResolvedValue({
        videoId: 'video-1',
        videoStatus: UploadVideoStatus.PROCESSED,
        metaStatus: UploadMetaStatus.PROCESSED,
      });
      repository.publicVideo.mockResolvedValue(undefined);

      const result = await service.transcodeVideo({
        processingId: 'proc-1',
        inforId: 'info-1',
        objectPath: 'private/user/video-1/original/file.mp4',
        mimeType: 'video/mp4',
      });

      expect(result).toEqual({
        manifestPath: 'private/user/video-1/segment/manifest.mpd',
        thumbnailPath: 'public/user/video-1/thumbnail/0.jpg',
      });
      expect(repository.completeVideoProcessing).toHaveBeenCalledWith(
        'info-1',
        'proc-1',
        'private/user/video-1/segment/manifest.mpd',
        'public/user/video-1/thumbnail/0.jpg',
        65,
      );
      expect(repository.publicVideo).toHaveBeenCalledWith('video-1');
      expect(fsMocks.promises.rm).toHaveBeenCalledWith(
        workDir,
        expect.objectContaining({ recursive: true, force: true }),
      );
    });

    it('does not publish the video when processing has not fully completed', async () => {
      const workDir = path.join(tempDir, 'info-2');
      mockArtifactDirectory(workDir);

      s3Service.getFileStream.mockResolvedValue({} as any);
      ffmpegService.getVideoMetadata.mockResolvedValue({
        duration: 10,
        width: 1920,
        height: 1080,
        bitrate: '5000k',
      });
      ffmpegService.transcodeToDASH.mockResolvedValue({
        manifest: 'manifest.mpd',
      });
      ffmpegService.extractThumbnail.mockResolvedValue(undefined);
      s3Service.parseVideoIdFromPrivatePath.mockReturnValue('video-2');
      s3Service.buildPrivateSegmentPath.mockImplementation(
        (videoId: string, relativePath: string) =>
          `private/user/${videoId}/segment/${relativePath}`,
      );
      s3Service.buildPublicThumbnailPath.mockImplementation(
        (videoId: string, relativePath: string) =>
          `public/user/${videoId}/thumbnail/${relativePath}`,
      );
      s3Service.uploadFileStream.mockImplementation(
        async (_filePath: string, objectPath: string) => objectPath,
      );
      repository.completeVideoProcessing.mockResolvedValue({
        videoId: 'video-2',
        videoStatus: UploadVideoStatus.PROCESSED,
        metaStatus: UploadMetaStatus.PENDING,
      });

      await service.transcodeVideo({
        processingId: 'proc-2',
        inforId: 'info-2',
        objectPath: 'private/user/video-2/original/file.mp4',
        mimeType: 'video/mp4',
      });

      expect(repository.publicVideo).not.toHaveBeenCalled();
    });

    it('records the failure and rethrows a TranscodingFailedException from the download step', async () => {
      s3Service.getFileStream.mockRejectedValue(new Error('network error'));

      await expect(
        service.transcodeVideo({
          processingId: 'proc-3',
          inforId: 'info-3',
          objectPath: 'r2/path',
          mimeType: 'video/mp4',
        }),
      ).rejects.toThrow(TranscodingFailedException);

      expect(repository.recordFailure).toHaveBeenCalledWith(
        'info-3',
        'proc-3',
        expect.stringContaining('R2 download failed'),
      );
    });

    it('wraps an unexpected error from ffmpeg metadata extraction', async () => {
      s3Service.getFileStream.mockResolvedValue({} as any);
      ffmpegService.getVideoMetadata.mockRejectedValue(
        new Error('probe failed'),
      );

      await expect(
        service.transcodeVideo({
          processingId: 'proc-4',
          inforId: 'info-4',
          objectPath: 'r2/path',
          mimeType: 'video/mp4',
        }),
      ).rejects.toThrow(TranscodingFailedException);

      expect(repository.recordFailure).toHaveBeenCalledWith(
        'info-4',
        'proc-4',
        expect.stringContaining('probe failed'),
      );
    });

    it('propagates an InvalidVideoException without wrapping it', async () => {
      s3Service.getFileStream.mockResolvedValue({} as any);
      ffmpegService.getVideoMetadata.mockRejectedValue(
        new InvalidVideoException('bad video', 'info-5'),
      );

      await expect(
        service.transcodeVideo({
          processingId: 'proc-5',
          inforId: 'info-5',
          objectPath: 'r2/path',
          mimeType: 'video/mp4',
        }),
      ).rejects.toThrow(InvalidVideoException);
    });

    it('throws when no transcoding artifacts were produced', async () => {
      const workDir = path.join(tempDir, 'info-6');
      fsMocks.promises.readdir.mockResolvedValue([]);

      s3Service.getFileStream.mockResolvedValue({} as any);
      ffmpegService.getVideoMetadata.mockResolvedValue({
        duration: 10,
        width: 1920,
        height: 1080,
        bitrate: '5000k',
      });
      ffmpegService.transcodeToDASH.mockResolvedValue({
        manifest: 'manifest.mpd',
      });
      ffmpegService.extractThumbnail.mockResolvedValue(undefined);
      s3Service.parseVideoIdFromPrivatePath.mockReturnValue('video-6');

      await expect(
        service.transcodeVideo({
          processingId: 'proc-6',
          inforId: 'info-6',
          objectPath: 'private/user/video-6/original/file.mp4',
          mimeType: 'video/mp4',
        }),
      ).rejects.toThrow('No transcoding artifacts found for upload');

      expect(repository.recordFailure).toHaveBeenCalledWith(
        'info-6',
        'proc-6',
        expect.stringContaining('No transcoding artifacts found for upload'),
      );
      void workDir;
    });

    it('does not throw when recording the failure itself fails', async () => {
      s3Service.getFileStream.mockRejectedValue(new Error('network error'));
      repository.recordFailure.mockRejectedValue(new Error('db down'));

      await expect(
        service.transcodeVideo({
          processingId: 'proc-7',
          inforId: 'info-7',
          objectPath: 'r2/path',
          mimeType: 'video/mp4',
        }),
      ).rejects.toThrow(TranscodingFailedException);
    });
  });
});
