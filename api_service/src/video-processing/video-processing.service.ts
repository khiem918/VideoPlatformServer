import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import pLimit from 'p-limit';
import { S3Service } from 'src/s3/s3.service';
import { FFmpegService } from './ffmpeg.service';
import { VideoProcessingRepository } from './repository/video-processing.repository';
import { TranscodingDataDto } from './dto/transcodingdata.dto';
import { TranscodingFailedException } from './exceptions/transcoding-failed.exception';
import { InvalidVideoException } from './exceptions/invalid-video.exception';
import { TranscodedVideoPaths } from './dto/transcodingdata.dto';
import { UploadMetaStatus, UploadVideoStatus } from '@prisma/client';

@Injectable()
export class VideoProcessingService {
  private readonly logger = new Logger(VideoProcessingService.name);
  private readonly tempDir = '/tmp/video-streaming-system/processing';
  private readonly maxConcurrentUploads = 4;

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

  /**
   * Transcodes a video to DASH format with thumbnail extraction and metadata generation.
   * @param data - Transcoding parameters including video path, processing ID, and MIME type
   * @returns Paths to the generated manifest and thumbnail files
   * @throws {InvalidVideoException} If the video is invalid or corrupted
   * @throws {TranscodingFailedException} If transcoding or upload fails
   */
  async transcodeVideo(
    data: TranscodingDataDto,
  ): Promise<TranscodedVideoPaths> {
    const { inforId, processingId, objectPath, mimeType } = data;
    const workDir = path.join(this.tempDir, inforId);

    try {
      // Download video from object storage to temporary working directory
      const inputPath = await this.downloadVideoFromObjectStorage(
        objectPath,
        workDir,
        mimeType,
      );

      // Extract video metadata and calculate duration for processing
      const metadata = await this.ffmpegService.getVideoMetadata(inputPath);
      const videoDuration = Math.max(1, Math.floor(metadata.duration));

      // Transcode video to DASH format for adaptive streaming
      const dashOutputDir = path.join(workDir, 'dash');
      await this.ffmpegService.transcodeToDASH(inputPath, dashOutputDir);

      // Extract and generate thumbnail from video
      const thumbsDir = path.join(workDir, 'thumb');
      await fs.promises.mkdir(thumbsDir, { recursive: true });
      const thumbnailPath = path.join(thumbsDir, '0.jpg');
      await this.ffmpegService.extractThumbnail(inputPath, thumbnailPath);

      // Upload transcoded files to object storage
      const uploadResult = await this.uploadToObjectStorage(
        workDir,
        processingId,
        data.objectPath,
      );

      /* 
     
        Using for processing successfully::
                  - update : video.uploadvideostatus = COMPLETED
                  - handle logic: if videoInfor.metaStatus is COMPLETED, then Video.videoStatus = AVAILABLE
      */

      const { videoId, videoStatus, metaStatus } =
        await this.repository.completeVideoProcessing(
          inforId,
          processingId,
          uploadResult.manifestPath,
          uploadResult.thumbnailPath,
          videoDuration,
        );

      // Trigger status update if all metadata is ready
      await this.triggerVideoStatus(videoId, videoStatus, metaStatus);

      this.logger.log(
        `Completed transcoding for video ${inforId}, manifest: ${uploadResult.manifestPath}, thumbnail: ${uploadResult.thumbnailPath}`,
      );

      return uploadResult;
    } catch (error) {
      // Record processing failure for error tracking and monitoring
      await this.recordFailure(inforId, processingId, error);

      if (error instanceof InvalidVideoException) {
        throw error;
      }

      if (error instanceof TranscodingFailedException) {
        throw error;
      }

      throw new TranscodingFailedException(
        `Transcoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        inforId,
        true,
      );
    } finally {
      // Clean up temporary files regardless of success or failure
      await this.cleanupTempFiles(workDir);
    }
  }

  private async downloadVideoFromObjectStorage(
    objectPath: string,
    workDir: string,
    mimeType: string,
  ): Promise<string> {
    try {
      await fs.promises.mkdir(workDir, { recursive: true });

      const extension = this.getFileExtension(mimeType);
      const inputPath = path.join(workDir, `input${extension}`);

      const videoStream = await this.s3Service.getFileStream(objectPath);
      const writeStream = fs.createWriteStream(inputPath);

      await pipeline(videoStream, writeStream);

      return inputPath;
    } catch (error) {
      throw error instanceof TranscodingFailedException
        ? error
        : new TranscodingFailedException(
          `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          objectPath.split('/')[0],
        );
    }
  }

  private async uploadToObjectStorage(
    localOutputDir: string,
    processingId: string,
    sourceObjectPath: string,
  ): Promise<TranscodedVideoPaths> {
    const videoId =
      this.s3Service.parseVideoIdFromPrivatePath(sourceObjectPath);

    // Collect every file produced by the transcoding step.
    const files = await this.getFilesRecursive(localOutputDir);

    // Keep only the artifacts that must be uploaded back to object storage.
    const artifactFiles = files.filter((file) => {
      const relativePath = path
        .relative(localOutputDir, file)
        .replace(/\\/g, '/');
      return (
        relativePath.startsWith('dash/') || relativePath.startsWith('thumb/')
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

    const limit = pLimit(this.maxConcurrentUploads);

    await Promise.all(
      artifactFiles.map((file) =>
        limit(async () => {
          const relativePath = path
            .relative(localOutputDir, file)
            .replace(/\\/g, '/');
          const mimeType = this.getMimeTypeByPath(relativePath);

          const objectPath = relativePath.startsWith('thumb/')
            ? this.s3Service.buildPublicThumbnailPath(
              videoId,
              relativePath.replace(/^thumb\//, ''),
            )
            : this.s3Service.buildPrivateSegmentPath(
              videoId,
              relativePath.replace(/^dash\//, ''),
            );

          const uploadedPath = await this.s3Service.uploadFileStream(
            file,
            objectPath,
            mimeType,
          );

          if (relativePath === 'dash/manifest.mpd') {
            remoteManifestPath = uploadedPath;
          }

          if (relativePath === 'thumb/0.jpg') {
            remoteThumbnailPath = uploadedPath;
          }
        }),
      ),
    );

    // Fail fast if any required artifact was not uploaded successfully.
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

    // Return the uploaded paths for downstream persistence.
    return {
      manifestPath: remoteManifestPath,
      thumbnailPath: remoteThumbnailPath,
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

  private async recordFailure(
    inforId: string,
    processingId: string,
    error: unknown,
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    try {
      await this.repository.recordFailure(inforId, processingId, errorMessage);

      this.logger.error(
        `Recorded failure for video ${inforId}: ${errorMessage}`,
      );
    } catch (dbError) {
      this.logger.error(`Failed to record failure for ${inforId}`, dbError);
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

  /*
  if videoInfor.metaStatus is COMPLETED, then Video.videoStatus = AVAILABLE & video.visibility = PUBLIC  
  */
  private async triggerVideoStatus(
    videoId: string,
    videoStatus: UploadVideoStatus,
    metaStatus: UploadMetaStatus,
  ): Promise<void> {
    if (
      videoStatus == UploadVideoStatus.PROCESSED &&
      metaStatus == UploadMetaStatus.PROCESSED
    ) {
      try {
        await this.repository.publicVideo(videoId);
      } catch (error) {
        this.logger.error(
          `Failed to update video status to AVAILABLE for video ${videoId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }
}
