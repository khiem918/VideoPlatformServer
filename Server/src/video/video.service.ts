import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { S3Service } from 'src/s3/s3.service';
import { VideoRepository } from './repository/video.repository';
import { VideoProcessingQueueService } from '../video-processing/video-processing.queue';
import { ulid } from 'ulid';
import { v4 as uuidv4 } from 'uuid';
import { UploadStatus } from '@prisma/client';
import { EmbedQueueService } from 'src/embed/embed.queue';
import { EmbedClient } from 'src/embed/embedservice/embed.client';
import { SemanticProcessingService } from 'src/semantic-processing/semantic-processing.service';
import { TagService } from 'src/tag/tag.service';
import { QdrantService } from 'src/qdrant/qdrant.service';
import { concat } from 'rxjs';
import { WatchVideoResponse } from './dto/watch-video.respone';

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
  private readonly logger = new Logger(VideoService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly videorepository: VideoRepository,
    private readonly VideoProcessingQueueService: VideoProcessingQueueService,
    private readonly embedQueueService: EmbedQueueService,
    private readonly embedClient: EmbedClient,
    private readonly qdrantService: QdrantService,
    private readonly semanticProcessingService: SemanticProcessingService,
    private readonly tagService: TagService
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

    const videoId = uuidv4();
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
    const video = await this.videorepository.findVideoById(videoId, userId);

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

    const processedVideos = Promise.all(
      videos.map(async (video) => {
        const isDraft = video.visibility === 'DRAFT';

        if (video.thumbnailUrl) {
          try {
            video.thumbnailUrl = await this.s3Service.getPresignedDownloadUrl(video.thumbnailUrl, 3600);
          } catch (error) {
            console.error(`Failed to get presigned URL for thumbnail ${video.thumbnailUrl}:`, error);
          }
        }

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
      }));

    return {
      total: (await processedVideos).length,
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
    const video = await this.videorepository.findVideoById(videoId, userId);

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


  async watchVideo(videoId: string, userId?: string): Promise<WatchVideoResponse> {
    const video = await this.videorepository.getVideoForWatching(videoId);

    if (!video || video.videoUrl === null) {
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

    const presignedUrl = await this.s3Service.getPresignedDownloadUrl(video.videoUrl, 3600);

    this.logger.log({
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
    })

    return {
      id: video.id,
      videoName: video.videoName,
      videoUrl: presignedUrl,
      duration: video.duration,
      videoView: video.videoView + 1,
      videoLike: video.videoLike,
      videoDislike: video.videoDislike,
      desc: video.rawDesc ? video.rawDesc : undefined,
      tags: video.videoHashtags?.map(vh => vh.displayTag) || [],
      ownerId: video.userOwner,
      ownerName: video.owner?.userName ? video.owner?.userName : video.userOwner,
      createdAt: video.createdAt,
    };
  }

  async searchVideos(userId: string, query: string, limit: number = 20, offset: number = 0) {
    const KEYWORD_WEIGHT = 0.3;
    const TITLE_VECTOR_WEIGHT = 0.4;
    const DESCRIPTION_VECTOR_WEIGHT = 0.3;
    const candidateLimit = Math.max(limit * 5, 50);

    const [queryVector, keywordResults] = await Promise.all([
      this.embedClient.generateQueryVector(query),
      this.videorepository.keywordSearch(query, candidateLimit),
    ]);

    // this.logger.log(`Generated query vector for search: ${JSON.stringify(queryVector)}`);lllkllll
    // this.logger.log(`Keyword search results: ${JSON.stringify(keywordResults)}`);

    const vectorResults = await this.qdrantService.searchSimilarVideos(
      queryVector,
      candidateLimit,
    );

    // this.logger.log(`Vector search results: ${JSON.stringify(vectorResults)}`);

    const maxKw = keywordResults.reduce((m, r) => Math.max(m, r.rank), 0) || 1;

    const scoreMap = new Map<string, { kw: number; title_vec: number, desc_vec: number }>();

    for (const r of keywordResults) {
      scoreMap.set(r.id, { kw: r.rank / maxKw, title_vec: 0, desc_vec: 0 });
    }

    for (const r of vectorResults[0]) {
      const videoId = r.payload?.['videoId'] as string | undefined ?? String(r.id);
      const entry = scoreMap.get(videoId) ?? { kw: 0, title_vec: 0, desc_vec: 0 };
      entry.title_vec = r.score;
      scoreMap.set(videoId, entry);
    }

    for (const r of vectorResults[1]) {
      const videoId = r.payload?.['videoId'] as string | undefined ?? String(r.id);
      const entry = scoreMap.get(videoId) ?? { kw: 0, title_vec: 0, desc_vec: 0 };
      entry.desc_vec = r.score;
      scoreMap.set(videoId, entry);
    }

    const ranked = Array.from(scoreMap.entries())
      .map(([videoId, scores]) => ({
        videoId,
        finalScore: KEYWORD_WEIGHT * scores.kw + TITLE_VECTOR_WEIGHT * scores.title_vec + DESCRIPTION_VECTOR_WEIGHT * scores.desc_vec,
      }))
      .sort((a, b) => b.finalScore - a.finalScore);

    const total = ranked.length;
    const page = ranked.slice(offset, offset + limit);

    const videos = await this.videorepository.findManyByIds(userId, page.map((r) => r.videoId));
    const videoMap = new Map(videos.map((v) => [v.id, v]));

    const resultsRaw = await Promise.all(
      page.map(async (r) => {
        const v = videoMap.get(r.videoId);
        if (!v) return null;

        if (v.thumbnailUrl) {
          try {
            v.thumbnailUrl = await this.s3Service.getPresignedDownloadUrl(v.thumbnailUrl, 3600);
          } catch (error) {
            console.error(`Failed to get presigned URL for thumbnail ${v.thumbnailUrl}:`, error);
          }
        }
        // this.logger.log(`Processed video for search result: ${v.id} - ${v.videoName}`);
        return {
          id: v.id,
          videoName: v.videoName,
          thumbnailUrl: v.thumbnailUrl,
          duration: v.duration,
          videoView: v.videoView,
          rawDesc: v.rawDesc,
          updatedAt: v.updatedAt,
          ownerName: v.owner.userName ? v.owner.userName : v.owner.id,
        };
      })
    );

    const results = resultsRaw.filter(Boolean);
    this.logger.log(`Final search results: ${JSON.stringify(results)}`);
    return { results, total };
  }

  async getVideoComments(videoId: string, cursor?: { createdAt: Date; id: bigint }) {
    const comments = await this.videorepository.getVideoComments(videoId, cursor);
    return comments.map(c => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      likeCount: c.likeCount,
      replyCount: c.replyCount,
      ownerName: c.user.userName ? c.user.userName : c.user.id,
    }))
  };


  async commentOnVideo(videoId: string, userId: string, content: string) {
    try {
      const video = await this.videorepository.findVideoById(videoId, userId);
      if (!video) {
        throw new NotFoundException('Video not found');
      }

      if (video.visibility === 'PRIVATE') {
        throw new ForbiddenException('Cannot comment on private video');
      }

      if (video.visibility === 'DRAFT') {
        throw new ForbiddenException('Cannot comment on unpublished video');
      }
      await this.videorepository.createComment(videoId, userId, content);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      console.error(`Error checking video visibility for commenting:`, error);
      throw new BadRequestException('Unable to comment on video at this time');
    }
  }
}
