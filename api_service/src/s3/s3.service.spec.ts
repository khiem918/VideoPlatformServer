import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
  HeadObjectCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
  GetObjectCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
  ListObjectsV2Command: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
  DeleteObjectsCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
}));

const mockGetSignedUrl = jest.fn();
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]): unknown => mockGetSignedUrl(...args),
}));

const mockGetSignedCookies = jest.fn();
jest.mock('@aws-sdk/cloudfront-signer', () => ({
  getSignedCookies: (...args: unknown[]): unknown =>
    mockGetSignedCookies(...args),
}));

const mockUploadDone = jest.fn();
const mockUploadCtor = jest.fn();
jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation((...args: unknown[]) => {
    mockUploadCtor(...args);
    return { done: mockUploadDone };
  }),
}));

const mockCreateReadStream = jest.fn();
jest.mock('fs', () => ({
  createReadStream: (...args: unknown[]): unknown =>
    mockCreateReadStream(...args),
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
          S3_ACCESS_KEY_ID: 'key-id',
          S3_SECRET_ACCESS_KEY: 'secret',
          S3_REGION: 'auto',
          BUCKET_NAME: 'bucket',
          R2_WORKER_URL: 'https://cdn.example.com',
          R2_SIGN_SECRET: 'sign-secret',
          WORKER_KEY: 'worker-key',
          CLOUDFRONT_DOMAIN_NAME: 'cdn.example.com',
          CLOUDFRONT_KEY_PAIR_ID: 'key-pair-id',
          CLOUDFRONT_PRIVATE_KEY: Buffer.from('private-key').toString('base64'),
        };
        return values[key];
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new S3Service(config);
  });

  describe('buildPrivateOriginalPath / buildPrivateSegmentPath / buildPublicThumbnailPath', () => {
    it('builds the private original path for a given video id', () => {
      const path = service.buildPrivateOriginalPath('video-1', 'file.mp4');

      expect(path).toBe('private/user/video-1/original/file.mp4');
    });

    it('builds the private segment path for a given video id', () => {
      const path = service.buildPrivateSegmentPath('video-1', 'manifest.mpd');

      expect(path).toBe('private/user/video-1/segment/manifest.mpd');
    });

    it('builds the public thumbnail path for a given video id', () => {
      const path = service.buildPublicThumbnailPath('video-1', '0.jpg');

      expect(path).toBe('public/user/video-1/thumbnail/0.jpg');
    });
  });

  describe('buildPrivatePrefix / buildPublicPrefix', () => {
    it('builds the private prefix for a video id', () => {
      expect(service.buildPrivatePrefix('video-1')).toBe(
        'private/user/video-1/',
      );
    });

    it('builds the public prefix for a video id', () => {
      expect(service.buildPublicPrefix('video-1')).toBe('public/user/video-1/');
    });
  });

  describe('parseVideoIdFromPrivatePath', () => {
    it('extracts the video id from a well-formed private path', () => {
      const videoId = service.parseVideoIdFromPrivatePath(
        'private/user/video-1/original/file.mp4',
      );

      expect(videoId).toBe('video-1');
    });

    it('throws for a malformed private path', () => {
      expect(() => service.parseVideoIdFromPrivatePath('bad/path')).toThrow(
        'Invalid private object path',
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
      expect(result.objectPath).toContain('video-1');
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
        'private/user/video-1/original/file.mp4',
        'video/mp4',
      );

      expect(result).toBe('private/user/video-1/original/file.mp4');
    });

    it('rethrows when the upload fails', async () => {
      mockSend.mockRejectedValue(new Error('upload failed'));

      await expect(
        service.uploadFile(Buffer.from('data'), 'path', 'video/mp4'),
      ).rejects.toThrow('upload failed');
    });
  });

  describe('uploadFileStream', () => {
    it('streams the file from disk and returns the object path', async () => {
      mockCreateReadStream.mockReturnValue('fake-read-stream');
      mockUploadDone.mockResolvedValue({});

      const result = await service.uploadFileStream(
        '/tmp/dash/segment-1.m4s',
        'private/user/video-1/segment/segment-1.m4s',
        'video/iso.segment',
      );

      expect(result).toBe('private/user/video-1/segment/segment-1.m4s');
      expect(mockCreateReadStream).toHaveBeenCalledWith(
        '/tmp/dash/segment-1.m4s',
      );
      const paramsMatcher: unknown = expect.objectContaining({
        Key: 'private/user/video-1/segment/segment-1.m4s',
        Body: 'fake-read-stream',
        ContentType: 'video/iso.segment',
      });
      expect(mockUploadCtor).toHaveBeenCalledWith(
        expect.objectContaining({ params: paramsMatcher }),
      );
    });

    it('rethrows when the upload fails', async () => {
      mockCreateReadStream.mockReturnValue('fake-read-stream');
      mockUploadDone.mockRejectedValue(new Error('upload failed'));

      await expect(
        service.uploadFileStream('/tmp/file.mp4', 'path', 'video/mp4'),
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

  describe('deleteDirectory', () => {
    it('lists and deletes all objects under the prefix', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'private/user/video-1/original/file.mp4' }],
          IsTruncated: false,
        })
        .mockResolvedValueOnce({});

      await service.deleteDirectory('private/user/video-1');

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('stops when there is nothing to delete', async () => {
      mockSend.mockResolvedValueOnce({ Contents: [] });

      await service.deleteDirectory('private/user/video-1');

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('throws InternalServerErrorException when listing fails', async () => {
      mockSend.mockRejectedValue(new Error('list failed'));

      await expect(
        service.deleteDirectory('private/user/video-1'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('generateCookieToGetVideo', () => {
    it('returns the resource url and signed cookies', () => {
      mockGetSignedCookies.mockReturnValue({
        'CloudFront-Policy': 'policy',
        'CloudFront-Signature': 'signature',
        'CloudFront-Key-Pair-Id': 'key-pair-id',
      });

      const result = service.generateCookieToGetVideo(
        'private/user/video-1/segment/manifest.mpd',
      );

      expect(result.url).toBe(
        'https://cdn.example.com/private/user/video-1/segment/manifest.mpd',
      );
      expect(result.cookies['CloudFront-Key-Pair-Id']).toBe('key-pair-id');
    });

    it('throws InternalServerErrorException when signing fails', () => {
      mockGetSignedCookies.mockImplementation(() => {
        throw new Error('sign failed');
      });

      expect(() =>
        service.generateCookieToGetVideo(
          'private/user/video-1/segment/manifest.mpd',
        ),
      ).toThrow(InternalServerErrorException);
    });
  });
});
