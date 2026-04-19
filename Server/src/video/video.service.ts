import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { S3Service } from 'src/s3/s3.service';
import { VideoRepository } from './repository/video.repository';
import { VideoProcessingQueueService } from '../video-processing/video-processing.queue';
import { ulid } from 'ulid';
import { v4 as uuidv4 } from 'uuid';
import { UploadStatus } from '@prisma/client';
import { EmbedQueueService } from 'src/embed/embed.queue';
import { SemanticProcessingService } from 'src/semantic-processing/semantic-processing.service';
import { TagService } from 'src/tag/tag.service';

@Injectable()
export class VideoService {
  private readonly allowedMimeTypes = [
    'video/mp4',
    'video/webm',
    'video/x-msvideo',
    'video/quicktime',
  ];

  private readonly maxFileSize = parseInt(
    process.env.MAX_FILE_SIZE || '10737418240',
  );

  constructor(
    private readonly s3Service: S3Service,
    private readonly videorepository: VideoRepository,
    private readonly VideoProcessingQueueService: VideoProcessingQueueService,
    private readonly embedQueueService: EmbedQueueService,
    private readonly semanticProcessingService : SemanticProcessingService,
    private readonly tagService : TagService
  ) { }

  async initUpload(
    userId: string,
    fileName: string,
    mimeType: string,
    fileSize: number,
  ): Promise<{ videoId: string, uploadId: string; presignedUrl: string; r2Path: string }> {
    if (!this.allowedMimeTypes.includes(mimeType)) {
      throw new BadRequestException(
        `Invalid video format. Allowed: ${this.allowedMimeTypes.join(', ')}`,
      );
    }
    if (fileSize > this.maxFileSize) {
      throw new BadRequestException(
        `File size exceeds maximum of 10GB (received: ${(fileSize / 1024 / 1024 / 1024).toFixed(2)}GB)`,
      );
    }

    const videoId = ulid();
    const videoUploadId = uuidv4();

    const { presignedUrl, r2Path } = await this.s3Service.getPresignedUploadUrl(
      fileName,
      videoId,
      mimeType,
    );

    await this.videorepository.initVideoUpload(
      userId,
      videoId,
      fileName,
      fileSize,
      r2Path,
      mimeType,
      videoUploadId,
    );

    return {
      videoId: videoId,
      uploadId: videoUploadId,
      presignedUrl,
      r2Path,
    };
  }

  async completeUpload(userId: string, uploadId: string): Promise<void> {
    const upload = await this.videorepository.findUpload(userId, uploadId);

    if (upload?.userId !== userId) {
      throw new NotFoundException('Upload session not found for this user');
    }

    if (upload.status !== UploadStatus.PENDING) {
      throw new BadRequestException('Upload session is not pending');
    }

    const isExistInR2 = await this.s3Service.fileExists(upload.r2Path);
    if (!isExistInR2) {
      throw new NotFoundException('Uploaded file not found in storage');
    }

    await Promise.all([
      this.videorepository.updateUploadStatus(userId, uploadId, UploadStatus.UPLOADED),
      this.videorepository.createVideoProcessing(upload.id),
    ]);

    await this.VideoProcessingQueueService.addTranscodingJob({
      uploadId: upload.id,
      r2Path: upload.r2Path,
      mimeType: upload.mimeType,
    });

  }

  async deleteVideo(userId: string, videoId: string): Promise<void> {
    const video = await this.videorepository.findVideoById(userId, videoId);

    if (!video) {
      throw new NotFoundException('Video not found for this user');
    }

    try { 
      let directoryPath = `videos/${videoId}/`;
      if (video.videoUrl) {
        const match = video.videoUrl.match(new RegExp(`(videos\\/[a-z0-9]+\\/[a-z0-9]+\\/${videoId})`, 'i'));
        if (match) {
          directoryPath = `${match[1]}/`;
        }
      }
      await this.s3Service.deleteDirectory(directoryPath);

      await this.videorepository.deleteVideo(userId, videoId);
    } catch (error) {
      console.error(`Failed to delete video from R2:`, error);
      throw new NotFoundException('Failed to delete video from storage');
    }
  }

  async getUserVideos(userId: string) {
    const videos = await this.videorepository.getUserAllVideos(userId);

    const processedVideos = videos.map((video) => {
      const isDraft = video.visibility === 'DRAFT';

      return {
        id: video.id,
        videoName: isDraft ? video.upload?.fileName : video.videoName,
        duration: video.duration,
        videoUrl: isDraft ? null : video.videoUrl,
        thumbnailUrl: isDraft ? null : video.thumbnailUrl,
        videoView: video.videoView,
        videoLike: video.videoLike,
        videoDislike: video.videoDislike,
        visibility: video.visibility,
        uploadStatus: isDraft ? video.upload?.status : null,
        uploadedAt: isDraft ? video.upload?.uploadedAt : null,
        rawDesc: isDraft ? null : video.rawDesc,
        tags: isDraft ? [] : video.videoHashtags?.map(vh => vh.displayTag),
        createdAt: video.createdAt,
        updatedAt: video.updatedAt,
      };
    });

    return {
      total: processedVideos.length,
      videos: processedVideos,
    };
  }

  async updateVideo(
    userId: string,
    videoId: string,
    title?: string,
    tags?: string[],
    description?: string,
    visibility?: 'DRAFT' | 'PRIVATE' | 'PUBLISHED',
  ): Promise<void> {
    const video = await this.videorepository.findVideoById(userId,videoId);

    if (!video || video.userOwner !== userId) {
      throw new NotFoundException('Video not found or not owned by user');
    }

    if (!title && !video.videoName) {
      throw new BadRequestException('Title is required for the video');
    }

    if (tags) {
      await this.tagService.handleTags(videoId, tags);
    }

    const handle_description_update = description !== undefined 
      ? (description ? await this.semanticProcessingService.processingDescription(description) : '') 
      : undefined;

    const result = await this.videorepository.updateVideo(
      userId,
      videoId,
      title,
      description,
      handle_description_update,
      visibility,
    );

    if (result.count === 0) {
      throw new NotFoundException('Video not found or not owned by user');
    }

    if (title !== undefined || description !== undefined) {
      try {
        await this.embedQueueService.addEmbedJob({
          videoId,
          title: title || video.videoName || '',
          description: handle_description_update !== undefined ? handle_description_update : '',
        });
      } catch (error) {
        console.error(`Failed to enqueue embedding job for video ${videoId}:`, error);
      }
    }
  }




  async watchVideo(videoId: string, userId?: string) {
    const video = await this.videorepository.getVideoForWatching(videoId);

    if (!video || !video.upload) {
      throw new NotFoundException('Video not found or processing not complete');
    }

    if (video.userOwner !== userId) {
      if (video.visibility === 'PRIVATE') {
        throw new ForbiddenException('This video is private');
      }
      if (video.visibility === 'DRAFT') {
        throw new ForbiddenException('This video is unpublished');
      }
    }

    this.videorepository.incrementViewCount(videoId).catch(err => {
      console.error('Failed to increment view count:', err);
    });

    const presignedUrl = await this.s3Service.getPresignedDownloadUrl(video.upload.r2Path, 3600);

    return {
      id: video.id,
      videoName: video.videoName,
      videoUrl: presignedUrl,
      thumbnailUrl: video.thumbnailUrl,
      duration: video.duration,
      videoView: video.videoView + 1, 
      videoLike: video.videoLike,
      videoDislike: video.videoDislike,
      visibility: video.visibility,
      rawDesc: video.rawDesc,
      tags: video.videoHashtags?.map(vh => vh.displayTag) || [],
      ownerId: video.userOwner,
      ownerName: video.owner?.userName,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
    };
  }
}
