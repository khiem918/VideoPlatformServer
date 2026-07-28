import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Logger } from '@nestjs/common';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import { Readable } from 'stream';
import { ConfigService } from '@nestjs/config';
import { getSignedCookies } from '@aws-sdk/cloudfront-signer';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);

  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly cloudfrontDomainName: string;
  private readonly keyPairId: string;
  private readonly privateKey: string;

  constructor(private readonly configService: ConfigService) {
    const accessKeyId =
      this.configService.get<string>('S3_ACCESS_KEY_ID') || '';
    const secretAccessKey =
      this.configService.get<string>('S3_SECRET_ACCESS_KEY') || '';
    const region = this.configService.get<string>('S3_REGION') || '';
    this.bucketName = this.configService.get<string>('BUCKET_NAME') || '';
    this.cloudfrontDomainName =
      this.configService.get<string>('CLOUDFRONT_DOMAIN_NAME') || '';
    this.keyPairId =
      this.configService.get<string>('CLOUDFRONT_KEY_PAIR_ID') || '';
    this.privateKey =
      Buffer.from(
        this.configService.get<string>('CLOUDFRONT_PRIVATE_KEY') || '',
        'base64',
      ).toString('utf-8') || '';

    this.s3Client = new S3Client({
      region: region,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });
  }

  buildPrivateOriginalPath(videoId: string, fileName: string): string {
    return `private/user/${videoId}/original/${fileName.replace(/^\/+/, '')}`;
  }

  buildPrivateSegmentPath(videoId: string, relativePath: string): string {
    return `private/user/${videoId}/segment/${relativePath.replace(/^\/+/, '')}`;
  }

  buildPublicThumbnailPath(videoId: string, fileName: string): string {
    return `public/user/${videoId}/thumbnail/${fileName.replace(/^\/+/, '')}`;
  }

  buildPrivatePrefix(videoId: string): string {
    return `private/user/${videoId}/`;
  }

  buildPublicPrefix(videoId: string): string {
    return `public/user/${videoId}/`;
  }

  parseVideoIdFromPrivatePath(objectPath: string): string {
    const parts = objectPath.replace(/^\/+/, '').split('/');

    if (parts.length < 3 || parts[0] !== 'private' || parts[1] !== 'user') {
      throw new Error(`Invalid private object path: ${objectPath}`);
    }

    return parts[2];
  }

  async getPresignedUploadUrl(
    fileName: string,
    videoId: string,
    mimeType: string,
  ): Promise<{ presignedUrl: string; objectPath: string }> {
    try {
      const objectPath = this.buildPrivateOriginalPath(videoId, fileName);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: objectPath,
        ContentType: mimeType,
      });

      const presignedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 1800,
      });

      return { presignedUrl, objectPath };
    } catch (error) {
      this.logger.error('Error generating presigned URL', error);
      throw new InternalServerErrorException(
        'Failed to generate presigned URL',
      );
    }
  }

  async uploadFile(
    fileBuffer: Buffer,
    objectPath: string,
    mimeType: string,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: objectPath,
        Body: fileBuffer,
        ContentType: mimeType,
      });
      await this.s3Client.send(command);
      this.logger.log(`File uploaded successfully: ${objectPath}`);
      return objectPath;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to upload file: ${message}`);
      throw error;
    }
  }

  async uploadFileStream(
    filePath: string,
    objectPath: string,
    mimeType: string,
  ): Promise<string> {
    try {
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucketName,
          Key: objectPath,
          Body: fs.createReadStream(filePath),
          ContentType: mimeType,
        },
      });
      await upload.done();
      this.logger.log(`File uploaded successfully: ${objectPath}`);
      return objectPath;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to upload file: ${message}`);
      throw error;
    }
  }

  async fileExists(objectPath: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: objectPath,
      });
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFound') {
        return false;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error checking file existence: ${message}`);
      throw error;
    }
  }

  async getFileStream(objectPath: string): Promise<Readable> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: objectPath,
      });

      const response = await this.s3Client.send(command);
      return response.Body as Readable;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to download file: ${message}`);
      throw error;
    }
  }

  async getPresignedDownloadUrl(
    objectPath: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: objectPath,
      });
      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error generating download presigned URL: ${message}`);
      throw new InternalServerErrorException('Failed to generate download URL');
    }
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

        const listResponse: ListObjectsV2CommandOutput =
          await this.s3Client.send(listCommand);

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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to delete directory contents for prefix ${prefix}: ${message}`,
      );
      throw new InternalServerErrorException(
        'Failed to delete directory contents',
      );
    }
  }

  generateCookieToGetVideo(path: string) {
    const normalizedPath = path.replace(/^\/+/, '');
    const resourceUrl = `https://${this.cloudfrontDomainName}/${normalizedPath}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    try {
      const cookies = getSignedCookies({
        url: resourceUrl,
        keyPairId: this.keyPairId,
        privateKey: this.privateKey,
        dateLessThan: expiresAt,
      });

      return {
        url: resourceUrl,
        cookies: cookies,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate signed cookies for path ${path}: ${error}`,
      );
      throw new InternalServerErrorException(
        'Failed to generate signed cookies for cloudfront',
      );
    }
  }

  generatePublicResourceUrl(path: string) {
    return `https://${this.cloudfrontDomainName}/public/user/${path}`;
  }
}
