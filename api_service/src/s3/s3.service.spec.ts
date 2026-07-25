import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  HeadObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  ListObjectsV2Command: jest.fn().mockImplementation((input) => ({ input })),
  DeleteObjectsCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

const mockGetSignedUrl = jest.fn();
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

import { S3Service } from './s3.service';

describe('S3Service', () => {
  let service: S3Service;
  let config: jest.Mocked<ConfigService>;

  beforeEach(() => {
    jest.clearAllMocks();

    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          CLOUDFLARE_R2_ACCESS_KEY_ID: 'key-id',
          CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'secret',
          CLOUDFLARE_R2_ENDPOINT: 'https://endpoint',
          CLOUDFLARE_R2_REGION: 'auto',
          CLOUDFLARE_R2_BUCKET_NAME: 'bucket',
          R2_WORKER_URL: 'https://cdn.example.com',
          R2_SIGN_SECRET: 'sign-secret',
          WORKER_KEY: 'worker-key',
        };
        return values[key];
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new S3Service(config);
  });

  describe('buildVideoPath / buildVideoPrefix', () => {
    it('builds a deterministic sharded path for a given video id', () => {
      const path1 = service.buildVideoPath('video-1', 'original/file.mp4');
      const path2 = service.buildVideoPath('video-1', 'original/file.mp4');

      expect(path1).toBe(path2);
      expect(path1).toMatch(
        /^videos\/[0-9a-f]{2}\/[0-9a-f]{2}\/video-1\/original\/file\.mp4$/,
      );
    });

    it('builds a prefix without a leading slash on the relative path', () => {
      const prefix = service.buildVideoPrefix('video-1');

      expect(prefix.endsWith('video-1/')).toBe(true);
    });
  });

  describe('buildVideoPrefixFromR2Path / extractVideoIdFromR2Path', () => {
    it('extracts the video id from a well-formed r2 path', () => {
      const videoId = service.extractVideoIdFromR2Path(
        'videos/aa/bb/video-1/original/file.mp4',
      );

      expect(videoId).toBe('video-1');
    });

    it('throws for a malformed r2 path', () => {
      expect(() => service.extractVideoIdFromR2Path('bad/path')).toThrow(
        'Invalid R2 video path',
      );
    });

    it('builds the prefix from a well-formed r2 path', () => {
      const prefix = service.buildVideoPrefixFromR2Path(
        'videos/aa/bb/video-1/original/file.mp4',
      );

      expect(prefix).toBe('videos/aa/bb/video-1/');
    });

    it('throws when building the prefix from a malformed r2 path', () => {
      expect(() => service.buildVideoPrefixFromR2Path('bad/path')).toThrow(
        'Invalid R2 video path',
      );
    });
  });

  describe('getPresignedUploadUrl', () => {
    it('returns the presigned url and r2 path', async () => {
      mockGetSignedUrl.mockResolvedValue('https://upload-url');

      const result = await service.getPresignedUploadUrl(
        'file.mp4',
        'video-1',
        'video/mp4',
      );

      expect(result.presignedUrl).toBe('https://upload-url');
      expect(result.r2Path).toContain('video-1');
    });

    it('throws InternalServerErrorException when signing fails', async () => {
      mockGetSignedUrl.mockRejectedValue(new Error('sign failed'));

      await expect(
        service.getPresignedUploadUrl('file.mp4', 'video-1', 'video/mp4'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('uploadFile', () => {
    it('uploads the buffer and returns the r2 path', async () => {
      mockSend.mockResolvedValue({});

      const result = await service.uploadFile(
        Buffer.from('data'),
        'videos/aa/bb/video-1/file.mp4',
        'video/mp4',
      );

      expect(result).toBe('videos/aa/bb/video-1/file.mp4');
    });

    it('rethrows when the upload fails', async () => {
      mockSend.mockRejectedValue(new Error('upload failed'));

      await expect(
        service.uploadFile(Buffer.from('data'), 'path', 'video/mp4'),
      ).rejects.toThrow('upload failed');
    });
  });

  describe('fileExists', () => {
    it('returns true when the head request succeeds', async () => {
      mockSend.mockResolvedValue({});

      await expect(service.fileExists('path')).resolves.toBe(true);
    });

    it('returns false when the object is not found', async () => {
      const notFoundError = Object.assign(new Error('not found'), {
        name: 'NotFound',
      });
      mockSend.mockRejectedValue(notFoundError);

      await expect(service.fileExists('path')).resolves.toBe(false);
    });

    it('rethrows other errors', async () => {
      mockSend.mockRejectedValue(new Error('network error'));

      await expect(service.fileExists('path')).rejects.toThrow('network error');
    });
  });

  describe('getFileStream / getFileBuffer', () => {
    it('returns the response body stream', async () => {
      const fakeStream = {};
      mockSend.mockResolvedValue({ Body: fakeStream });

      const result = await service.getFileStream('path');

      expect(result).toBe(fakeStream);
    });

    it('rethrows when the download fails', async () => {
      mockSend.mockRejectedValue(new Error('download failed'));

      await expect(service.getFileStream('path')).rejects.toThrow(
        'download failed',
      );
    });

    it('reads the stream into a single buffer', async () => {
      async function* generate() {
        yield Buffer.from('hello ');
        yield Buffer.from('world');
      }
      mockSend.mockResolvedValue({ Body: generate() });

      const result = await service.getFileBuffer('path');

      expect(result.toString()).toBe('hello world');
    });
  });

  describe('getPresignedDownloadUrl', () => {
    it('returns a presigned download url', async () => {
      mockGetSignedUrl.mockResolvedValue('https://download-url');

      const result = await service.getPresignedDownloadUrl('path');

      expect(result).toBe('https://download-url');
    });

    it('throws InternalServerErrorException when signing fails', async () => {
      mockGetSignedUrl.mockRejectedValue(new Error('sign failed'));

      await expect(service.getPresignedDownloadUrl('path')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('getDownloadUrl', () => {
    it('builds the CDN url from the configured worker url', async () => {
      const result = await service.getDownloadUrl(
        'videos/aa/bb/video-1/file.mp4',
      );

      expect(result).toBe(
        'https://cdn.example.com/videos/aa/bb/video-1/file.mp4',
      );
    });
  });

  describe('deleteDirectory', () => {
    it('lists and deletes all objects under the prefix', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'videos/aa/bb/video-1/file.mp4' }],
          IsTruncated: false,
        })
        .mockResolvedValueOnce({});

      await service.deleteDirectory('videos/aa/bb/video-1');

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('stops when there is nothing to delete', async () => {
      mockSend.mockResolvedValueOnce({ Contents: [] });

      await service.deleteDirectory('videos/aa/bb/video-1');

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('throws InternalServerErrorException when listing fails', async () => {
      mockSend.mockRejectedValue(new Error('list failed'));

      await expect(
        service.deleteDirectory('videos/aa/bb/video-1'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('signUrl', () => {
    it('returns a deterministic HMAC signature', async () => {
      const signature1 = await service.signUrl(1000);
      const signature2 = await service.signUrl(1000);

      expect(signature1).toBe(signature2);
      expect(signature1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('throws InternalServerErrorException when the sign secret is missing', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'R2_SIGN_SECRET') return undefined;
        return 'value';
      });

      await expect(service.signUrl(1000)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
