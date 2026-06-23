import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { S3Service } from 'src/s3/s3.service';
import { FFmpegService } from './ffmpeg.service';
import { VideoProcessingRepository } from './repository/video-processing.repository';
import { TranscodingDataDto } from './dto/transcodingdata.dto';
import { TranscodingFailedException } from './exceptions/transcoding-failed.exception';
import { InvalidVideoException } from './exceptions/invalid-video.exception';
import { ProcessingStatus } from '@prisma/client';
import { TranscodedVideoPaths } from './dto/transcodingdata.dto';

@Injectable()
export class VideoProcessingService {

  private readonly logger = new Logger(VideoProcessingService.name);
  private readonly tempDir = '/tmp/video-processing';

  constructor(
    private readonly ffmpegService: FFmpegService,
    private readonly repository: VideoProcessingRepository,
    private readonly s3Service: S3Service,
  ) {
    this.ensureTempDir();
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }


  async transcodeVideo(data: TranscodingDataDto): Promise<TranscodedVideoPaths> {

    const { uploadId, processingId, r2Path, mimeType } = data;
    const workDir = path.join(this.tempDir, uploadId);

    try {

      const inputPath = await this.downloadVideoFromR2(
        r2Path,
        workDir,
        mimeType,
      );

      const metadata = await this.ffmpegService.getVideoMetadata(inputPath);
      const videoDuration = Math.max(1, Math.floor(metadata.duration));

      const dashOutputDir = path.join(workDir, 'dash');

      await this.ffmpegService.transcodeToDASH(
        inputPath,
        dashOutputDir,
      );

      const thumbsDir = path.join(workDir, 'thumb');
      await fs.promises.mkdir(thumbsDir, { recursive: true });

      const thumbnailPath = path.join(thumbsDir, '0.jpg');
      await this.ffmpegService.extractThumbnail(inputPath, thumbnailPath);

      const metadataPath = path.join(workDir, 'meta.json');

      await fs.promises.writeFile(
        metadataPath,
        JSON.stringify(
          {
            uploadId,
            originalPath: data.r2Path,
            manifest: 'dash/manifest.mpd',
            thumbnails: ['thumb/0.jpg'],
            video: metadata,
            generatedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        'utf8',
      );

      const uploadResult = await this.uploadToR2(
        workDir,
        uploadId,
        r2Path,
      );

      await this.repository.finalizeProcessingAndUpdateVideo(
        uploadId,
        uploadResult.manifestPath,
        uploadResult.thumbnailPath,
        videoDuration,
      );

      this.logger.log(
        `Completed transcoding for video ${uploadId}, manifest: ${uploadResult.manifestPath}, thumbnail: ${uploadResult.thumbnailPath}`,
      );

      return uploadResult;

    } catch (error) {
      await this.recordFailure(uploadId, processingId, error);

      if (error instanceof InvalidVideoException) {
        throw error;
      }

      if (error instanceof TranscodingFailedException) {
        throw error;
      }

      throw new TranscodingFailedException(
        `Transcoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        uploadId,
        true,
      );
    } finally {
      await this.cleanupTempFiles(workDir);
    }
  }

  private async downloadVideoFromR2(
    r2Path: string,
    workDir: string,
    mimeType: string,
  ): Promise<string> {
    try {
      await fs.promises.mkdir(workDir, { recursive: true });

      const extension = this.getFileExtension(mimeType);
      const inputPath = path.join(workDir, `input${extension}`);

      const videoStream = await this.s3Service.getFileStream(r2Path);
      const writeStream = fs.createWriteStream(inputPath);

      await pipeline(videoStream, writeStream);

      return inputPath;

    } catch (error) {
      throw error instanceof TranscodingFailedException
        ? error
        : new TranscodingFailedException(
          `R2 download failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          r2Path.split('/')[0],
        );
    }
  }

  private async uploadToR2(
    localOutputDir: string,
    processingId: string,
    sourceR2Path: string,
  ): Promise<TranscodedVideoPaths> {

    const videoId = this.s3Service.extractVideoIdFromR2Path(sourceR2Path);

    const files = await this.getFilesRecursive(localOutputDir);

    const artifactFiles = files.filter((file) => {
      const relativePath = path.relative(localOutputDir, file).replace(/\\/g, '/');
      return (
        relativePath.startsWith('dash/') ||
        relativePath.startsWith('thumb/') ||
        relativePath === 'meta.json'
      );
    });

    if (artifactFiles.length === 0) {
      throw new TranscodingFailedException(
        'No transcoding artifacts found for upload',
        processingId,
      );
    }

    let remoteManifestPath: string | null = null;
    let remoteThumbnailPath: string | null = null;
    let remoteMetadataPath: string | null = null;

    await Promise.all(
      artifactFiles.map(async (file) => {
        const relativePath = path.relative(localOutputDir, file).replace(/\\/g, '/');
        const fileBuffer = await fs.promises.readFile(file);
        const mimeType = this.getMimeTypeByPath(relativePath);
        const r2Path = this.s3Service.buildVideoPath(videoId, relativePath);

        const uploadedPath = await this.s3Service.uploadFile(
          fileBuffer,
          r2Path,
          mimeType,
        );

        if (relativePath === 'dash/manifest.mpd') {
          remoteManifestPath = uploadedPath;
        }

        if (relativePath === 'thumb/0.jpg') {
          remoteThumbnailPath = uploadedPath;
        }

        if (relativePath === 'meta.json') {
          remoteMetadataPath = uploadedPath;
        }
      }),
    );

    if (!remoteManifestPath) {
      throw new TranscodingFailedException(
        'Manifest upload failed',
        processingId,
      );
    }

    if (!remoteThumbnailPath) {
      throw new TranscodingFailedException(
        'Thumbnail upload failed',
        processingId,
      );
    }

    if (!remoteMetadataPath) {
      throw new TranscodingFailedException(
        'Metadata upload failed',
        processingId,
      );
    }

    return {
      manifestPath: remoteManifestPath,
      thumbnailPath: remoteThumbnailPath,
      metadataPath: remoteMetadataPath,
    };
  }

  private async getFilesRecursive(dir: string): Promise<string[]> {
    const results: string[] = [];
    const stack: string[] = [dir];

    while (stack.length > 0) {
      const currentDir = stack.pop();
      if (!currentDir) continue;

      const entries = await fs.promises.readdir(currentDir, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        const filePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          stack.push(filePath);
        } else {
          results.push(filePath);
        }
      }
    }

    return results;
  }


  private async recordFailure(uploadId: string, processingId: string, error: unknown): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    try {

      await this.repository.recordFailure(uploadId, processingId, errorMessage);
     
      this.logger.error(`Recorded failure for video ${uploadId}: ${errorMessage}`);

    } catch (dbError) {

      this.logger.error(`Failed to record failure for ${uploadId}`, dbError);

    }
  }

  private async cleanupTempFiles(workDir: string): Promise<void> {
    try {
      if (fs.existsSync(workDir)) {
        await fs.promises.rm(workDir, { recursive: true, force: true });
        this.logger.debug(`Cleaned up temporary directory: ${workDir}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to cleanup temp directory ${workDir}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }


  private getFileExtension(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'video/mp4': '.mp4',
      'video/x-matroska': '.mkv',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
      'video/x-msvideo': '.avi',
    };

    return mimeToExt[mimeType] || '.mp4';
  }

  private getMimeTypeByPath(relativePath: string): string {
    if (relativePath.endsWith('.mpd')) {
      return 'application/dash+xml';
    }

    if (relativePath.endsWith('.m4s')) {
      return 'video/iso.segment';
    }

    if (relativePath.endsWith('.mp4')) {
      return 'video/mp4';
    }

    if (relativePath.endsWith('.jpg') || relativePath.endsWith('.jpeg')) {
      return 'image/jpeg';
    }

    if (relativePath.endsWith('.png')) {
      return 'image/png';
    }

    if (relativePath.endsWith('.json')) {
      return 'application/json';
    }

    return 'application/octet-stream';
  }
}
