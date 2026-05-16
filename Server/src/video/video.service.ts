import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { S3Service } from 'src/s3/s3.service';
import { VideoRepository } from './repository/video.repository';
import { VideoProcessingQueueService } from '../video-processing/video-processing.queue';
import { v4 as uuidv4 } from 'uuid';
import { UploadStatus } from '@prisma/client';
import { EmbedQueueService } from 'src/embed/embed.queue';
import { SemanticProcessingService } from 'src/semantic-processing/semantic-processing.service';
import { TagService } from 'src/tag/tag.service';
import { QdrantService } from 'src/qdrant/qdrant.service';
import { WatchVideoResponse, WatchVideoUrlResponse } from './dto/watch-video.respone';
import { NotificationService } from 'src/notification/notification.service';

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
    private readonly qdrantService: QdrantService,
    private readonly semanticProcessingService: SemanticProcessingService,
    private readonly tagService: TagService,
    private readonly notificationService: NotificationService,
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

  async completeUpload(userId: string, uploadId: string) {
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

      Promise.all([
        await this.s3Service.deleteDirectory(directoryPath),
        await this.qdrantService.deleteVideoVector(videoId),
        await this.videorepository.deleteVideo(userId, videoId),
      ]);

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
          rawDesc: isDraft ? null : video.videoDesc,
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
    isFirstPublish?: boolean,
  ) {
    const video = await this.videorepository.findVideoById(videoId, userId);

    if (!video || video.userOwner !== userId) {
      throw new NotFoundException('Video not found or not owned by user');
    }

    if (!title && !video.videoName) {
      throw new BadRequestException('Title is required for the video');
    }
    const normalized_desc = description !== undefined ? await this.semanticProcessingService.processingDescription(description) : undefined;
    
    const handle_description_update = normalized_desc !== undefined
      ? (normalized_desc ? await this.semanticProcessingService.summarizeDescription(normalized_desc as string) : '')
      : undefined;

    if (title !== undefined || description !== undefined) {
      try {
        await this.embedQueueService.addEmbedJob({
          videoId,
          userOwner: video.userOwner,
          title: await this.semanticProcessingService.normalizeText(title || video.videoName || ''),
          description: handle_description_update !== undefined ? handle_description_update : '',
          createdAt: new Date(video.createdAt).getTime(),
        });
      } catch (error) {
        console.error(`Failed to enqueue embedding job for video ${videoId}:`, error);
        throw new BadRequestException('Failed to process video metadata for search indexing');
      }
    }

    if (tags) {
      await this.tagService.handleTags(videoId, tags);
    }

    const videoStatus = await this.videorepository.getVideoStatus(userId, videoId);

    if (videoStatus?.upload?.processing?.status !== 'COMPLETED' || videoStatus.upload?.processing?.status !== null) {
      visibility = 'DRAFT';
    }

    const result = await this.videorepository.updateVideo(
      userId,
      videoId,
      title,
      description,
      handle_description_update,
      visibility,
    );

    if (isFirstPublish && isFirstPublish === true) {
      this.notificationService.sendNotification(
        userId,
        'NEW_SUBSCRIBED_CHANNELS_VIDEO',
         `${video.userOwner} has published a new video: ${title || video.videoName || 'Untitled Video'}`,
        'CHANNEL',
      ).catch(error => {
        console.error(`Failed to send notification for new published video ${videoId}:`, error);
      });
    }

    if (!result) {
      throw new NotFoundException('Video not found or not owned by user');
    }

    if (result.thumbnailUrl) {
      try {
        result.thumbnailUrl = await this.s3Service.getPresignedDownloadUrl(result.thumbnailUrl, 3600);
      } catch (error) {
        console.error(`Failed to get presigned URL for thumbnail ${result.thumbnailUrl}:`, error);
      }
    }

    return {
      id: result.id,
      videoName: result.videoName,
      duration: result.duration,
      videoUrl: result.videoUrl,
      thumbnailUrl: result.thumbnailUrl,
      videoView: result.videoView,
      videoLike: result.videoLike,
      videoDislike: result.videoDislike,
      visibility: result.visibility,
      rawDesc: result.videoDesc,
      tags: tags,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    }
  }

  async getWatchVideoMetadata(videoId: string, userId: string): Promise<WatchVideoResponse> {
    const video = await this.videorepository.getVideoForWatching(userId, videoId);

    if (!video || video.res1?.videoUrl === null) {
      throw new NotFoundException('Video not found or processing not complete');
    }

    if (video.res1?.userOwner !== userId) {
      if (video.res1?.visibility === 'PRIVATE') {
        throw new ForbiddenException('This video is private');
      }
      if (video.res1?.visibility === 'DRAFT') {
        throw new ForbiddenException('This video is unpublished');
      }
    }

    Promise.all([
      this.videorepository.incrementViewCount(videoId).catch(err => {
        console.error('Failed to increment view count:', err);
      }),
      ...(userId ? [this.videorepository.updateHistory(userId, videoId).catch(err => {
        console.error('Failed to update video history:', err);
      })] : [])
    ]);



    return {
      id: video.res1.id,
      videoName: video.res1.videoName,
      duration: video.res1.duration,
      videoView: video.res1.videoView + 1,
      videoLike: video.res1.videoLike,
      videoDislike: video.res1.videoDislike,
      desc: video.res1.videoDesc ? video.res1.videoDesc : undefined,
      tags: video.res1.videoHashtags?.map(vh => vh.displayTag) || [],
      ownerId: video.res1.userOwner,
      ownerName: video.res1.owner?.userName ? video.res1.owner?.userName : video.res1.userOwner,
      createdAt: video.res1.createdAt,
      subscriberCount: video.res1?.owner?.subscribeCount || 0,
      isSubscribe: video.res3? true : false,
      isLiked: video.res2 ? ( video.res2.isLike === true ? true : false) : false,
      isDisliked: video.res2 ? ( video.res2.isLike === false ? true : false) : false,
    };
  }

  async getWatchVideoUrl(userId: string, videoId: string): Promise<WatchVideoUrlResponse> {
    const video = await this.videorepository.findVideoById(videoId);

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

    const expiresAt = Date.now() + 100 * 60 * 1000;
    const sig = await this.s3Service.signUrl(expiresAt);
    const mdpUrl = await this.s3Service.getDownloadUrl(video.videoUrl);

    return {
      signature: sig,
      expiresAt: expiresAt,
      mpdUrl: mdpUrl,
    };
  }

  async getVideoComments(videoId: string, cursor?: { createdAt: Date; id: bigint }) {
    const comments = await this.videorepository.getVideoComments(videoId, cursor);
    return comments.map(c => ({
      id: c.id.toString(),
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
      const comment = await this.videorepository.createComment(videoId, userId, content);

      return {
        id: comment.id.toString(),
        content: comment.content,
        createdAt: comment.createdAt,
        ownerName: comment.user.userName ? comment.user.userName : comment.user.id,
        likeCount: 0,
        replyCount: 0,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      console.error(`Error checking video visibility for commenting:`, error);
      throw new BadRequestException('Unable to comment on video at this time');
    }
  }

  async updateVideoHistory(userId: string, videoId: string, pauseAt?: number) {
    await this.videorepository.updateHistory(userId, videoId, pauseAt);
  }


  async likeOrDislikeVideo(userId: string, videoId: string, like: boolean) {
    const video = await this.videorepository.findVideoById(videoId, userId);
    if (!video) {
      throw new NotFoundException('Video not found');
    }

    if (video.visibility === 'PRIVATE') {
      throw new ForbiddenException('Cannot like/dislike private video');
    }

    if (video.visibility === 'DRAFT') {
      throw new ForbiddenException('Cannot like/dislike unpublished video');
    }

    const res = await this.videorepository.likeOrDislikeVideo(userId, videoId, like);
    if (!res) {
      throw new NotFoundException('Like/dislike operation failed');
    }
    return { likeCount: res.videoLike, dislikeCount: res.videoDislike };
  }

  async subscribeChannel(userId: string, channelId: string, subscribe: boolean) {
    if (userId === channelId) {
      throw new BadRequestException('Cannot subscribe to your own channel');
    }

    const result = await this.videorepository.subscribeChannel(userId, channelId, subscribe);
    if (!result) {
      throw new NotFoundException('Subscription operation failed or channel not found');
    }
    return {
      subscriberCount : result.subscribeCount,
      isSubscribe : subscribe
    };
  }

  async trackVideoWatchProgress(userId: string, videoId: string, pauseAt?: number) {
    const video = await this.videorepository.findVideoById(videoId, userId);    
    if (!video) {
      throw new NotFoundException('Video not found');
    }     
    if (video.visibility === 'PRIVATE') {
      throw new ForbiddenException('Cannot track progress of private video');
    }     
    if (video.visibility === 'DRAFT') {
      throw new ForbiddenException('Cannot track progress of unpublished video');
    }     
    await this.videorepository.updateHistory(userId, videoId, pauseAt);
  }   
}
