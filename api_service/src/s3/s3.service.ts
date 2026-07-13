import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { Logger } from '@nestjs/common';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { InternalServerErrorException } from '@nestjs/common';
import { Readable } from 'stream';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';

@Injectable()
export class S3Service {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly logger = new Logger(S3Service.name);

  constructor(private readonly configService: ConfigService) {
    const accessKeyId =
      this.configService.get<string>('CLOUDFLARE_R2_ACCESS_KEY_ID') || '';
    const secretAccessKey =
      this.configService.get<string>('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '';
    const endpoint =
      this.configService.get<string>('CLOUDFLARE_R2_ENDPOINT') || '';
    const region = this.configService.get<string>('CLOUDFLARE_R2_REGION') || '';
    const bucketName =
      this.configService.get<string>('CLOUDFLARE_R2_BUCKET_NAME') || '';

    this.bucketName = bucketName;

    this.s3Client = new S3Client({
      region: region,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
      endpoint: endpoint,
    });
  }

  buildVideoPath(videoId: string, relativePath: string): string {
    const shard = this.buildVideoShard(videoId);
    return `videos/${shard}/${videoId}/${relativePath.replace(/^\/+/, '')}`;
  }

  buildVideoPrefix(videoId: string): string {
    const shard = this.buildVideoShard(videoId);
    return `videos/${shard}/${videoId}/`;
  }

  buildVideoPrefixFromR2Path(r2Path: string): string {
    const parts = r2Path.replace(/^\/+/, '').split('/');

    if (parts.length < 4 || parts[0] !== 'videos') {
      throw new Error(`Invalid R2 video path: ${r2Path}`);
    }

    return `${parts[0]}/${parts[1]}/${parts[2]}/${parts[3]}/`;
  }

  extractVideoIdFromR2Path(r2Path: string): string {
    const parts = r2Path.replace(/^\/+/, '').split('/');

    if (parts.length < 4 || parts[0] !== 'videos') {
      throw new Error(`Invalid R2 video path: ${r2Path}`);
    }

    return parts[3];
  }

  private buildVideoShard(videoId: string): string {
    const hash = createHash('md5').update(videoId).digest('hex');
    return `${hash.slice(0, 2)}/${hash.slice(2, 4)}`;
  }

  async getPresignedUploadUrl(
    fileName: string,
    videoId: string,
    mimeType: string,
  ): Promise<{ presignedUrl: string; r2Path: string }> {
    try {
      const r2Path = this.buildVideoPath(videoId, `original/${fileName}`);
      this.logger.debug(`Generating presigned URL for R2 path: ${r2Path}`);
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: r2Path,
        ContentType: mimeType,
      });

      const presignedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 1800,
      });
      return { presignedUrl, r2Path };
    } catch (error) {
      this.logger.error('Error generating presigned URL', error);
      throw new InternalServerErrorException(
        'Failed to generate presigned URL',
      );
    }
  }

  async uploadFile(
    fileBuffer: Buffer,
    r2Path: string,
    mimeType: string,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: r2Path,
        Body: fileBuffer,
        ContentType: mimeType,
      });
      await this.s3Client.send(command);
      this.logger.log(`File uploaded successfully: ${r2Path}`);
      return r2Path;
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`);
      throw error;
    }
  }

  async fileExists(r2Path: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: r2Path,
      });
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      this.logger.error(`Error checking file existence: ${error.message}`);
      throw error;
    }
  }

  async getFileStream(r2Path: string): Promise<Readable> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: r2Path,
      });

      const response = await this.s3Client.send(command);
      return response.Body as Readable;
    } catch (error: any) {
      this.logger.error(`Failed to download file: ${error.message}`);
      throw error;
    }
  }

  async getFileBuffer(r2Path: string): Promise<Buffer> {
    try {
      const stream = await this.getFileStream(r2Path);

      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error: any) {
      this.logger.error(`Failed to read file into buffer: ${error.message}`);
      throw error;
    }
  }

  async getPresignedDownloadUrl(
    r2Path: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: r2Path,
      });
      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error: any) {
      this.logger.error(
        `Error generating download presigned URL: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to generate download URL');
    }
  }

  async getDownloadUrl(r2Path: string): Promise<string> {
    return `${this.configService.get<string>('R2_WORKER_URL')}/${r2Path}`;
  }

  async deleteDirectory(prefix: string): Promise<void> {
    try {
      const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;

      let isTruncated = true;
      let continuationToken: string | undefined = undefined;

      while (isTruncated) {
        const listCommand = new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: normalizedPrefix,
          ContinuationToken: continuationToken,
        });

        const listResponse: any = await this.s3Client.send(listCommand);

        if (!listResponse.Contents || listResponse.Contents.length === 0) {
          break;
        }

        const objectsToDelete = listResponse.Contents.map((obj) => ({
          Key: obj.Key,
        }));

        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.bucketName,
          Delete: {
            Objects: objectsToDelete,
            Quiet: true,
          },
        });

        await this.s3Client.send(deleteCommand);

        isTruncated = listResponse.IsTruncated ?? false;
        continuationToken = listResponse.NextContinuationToken;
      }

      this.logger.log(
        `Successfully deleted directory contents for prefix: ${normalizedPrefix}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to delete directory contents for prefix ${prefix}: ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to delete directory contents',
      );
    }
  }

  async signUrl(expiresIn: number = 3600): Promise<string> {
    const secret_key = this.configService.get<string>('R2_SIGN_SECRET');
    const key = this.configService.get<string>('WORKER_KEY');

    const data = `${key}:${expiresIn}`;

    if (!secret_key) {
      this.logger.error('Missing R2_SIGN_SECRET in configuration');
      throw new InternalServerErrorException(
        'Missing R2_SIGN_SECRET in configuration',
      );
    }

    return createHmac('sha256', secret_key).update(data).digest('hex');
  }
}
