import { UseGuards } from '@nestjs/common/decorators/core/use-guards.decorator';
import { Resolver, Query, Mutation, Args, Int, Context } from '@nestjs/graphql';
import { gqlCurrentUser } from 'src/auth/decorator/gql-current-user.decorator';
import { GqlAuthGuard } from 'src/auth/guard/gql-auth.guard';
import { VideoService } from './video.service';
import { InitUploadResponse } from './dto/init-upload.response';
import {
  UserVideosListResponse,
  UserVideoResponse,
} from './dto/user-videos.response';
import {
  WatchVideoResponse,
  WatchVideoUrlResponse,
  LikeDislikeResponse,
  SubscribeChannelResponse,
} from './dto/watch-video.respone';
import { CommentContentResponse } from './dto/comment-content.respone';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Resolver()
export class VideoResolver {
  constructor(
    private readonly videoService: VideoService,
    private readonly config: ConfigService,
  ) {}

  @Mutation(() => InitUploadResponse)
  @UseGuards(GqlAuthGuard)
  async initUploadVideo(
    @gqlCurrentUser() user: { userId: string },
    @Args('fileName') fileName: string,
    @Args('fileSize') fileSize: number,
    @Args('mimeType') mimeType: string,
  ): Promise<InitUploadResponse> {
    const uploadData = await this.videoService.initUpload(
      user.userId,
      fileName,
      mimeType,
      fileSize,
    );

    return {
      videoId: uploadData.videoId,
      presignedUrl: uploadData.presignedUrl,
    };
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async completeUploadVideo(
    @gqlCurrentUser() user: { userId: string },
    @Args('uploadId') uploadId: string,
  ): Promise<boolean> {
    await this.videoService.completeUpload(user.userId, uploadId);
    return true;
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async deleteVideoUpload(
    @gqlCurrentUser() user: { userId: string },
    @Args('uploadId') uploadId: string,
  ): Promise<boolean> {
    await this.videoService.deleteVideo(user.userId, uploadId);
    return true;
  }

  @Query(() => UserVideosListResponse)
  @UseGuards(GqlAuthGuard)
  async getUserVideos(
    @gqlCurrentUser() user: { userId: string },
  ): Promise<UserVideosListResponse> {
    const result = await this.videoService.getUserVideos(user.userId);
    return result as unknown as UserVideosListResponse;
  }

  @Mutation(() => UserVideoResponse)
  @UseGuards(GqlAuthGuard)
  async updateVideo(
    @gqlCurrentUser() user: { userId: string },
    @Args('videoId') videoId: string,
    @Args('title') title: string,
    @Args('tags', { type: () => [String], nullable: true }) tags: string[],
    @Args('description', { type: () => String, nullable: true })
    description: string,
    @Args('visibility') visibility: string,
  ): Promise<UserVideoResponse> {
    return (await this.videoService.updateVideo(
      user.userId,
      videoId,
      title,
      tags,
      description,
      visibility as 'PRIVATE' | 'PUBLIC',
    )) as UserVideoResponse;
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async deleteVideo(
    @gqlCurrentUser() user: { userId: string },
    @Args('videoId') videoId: string,
  ): Promise<boolean> {
    await this.videoService.deleteVideo(user.userId, videoId);
    return true;
  }

  @Query(() => WatchVideoResponse)
  @UseGuards(GqlAuthGuard)
  async getWatchVideoMetadata(
    @Args('videoId') videoId: string,
    @gqlCurrentUser() user: { userId: string },
  ): Promise<WatchVideoResponse> {
    const result = await this.videoService.getWatchVideoMetadata(
      videoId,
      user.userId,
    );
    return result;
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => WatchVideoUrlResponse)
  async getWatchVideoUrl(
    @Args('videoId') videoId: string,
    @gqlCurrentUser() user: { userId: string },
    @Context('res') res: Response,
  ): Promise<WatchVideoUrlResponse> {
    const { mpdUrl, cookies } = await this.videoService.getWatchVideoUrl(
      user.userId,
      videoId,
    );

    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'strict' as const,
      domain: this.config.get<string>('CDN_DOMAIN'),
      path: '/private/',
      maxAge: 5 * 60 * 1000,
    };

    res.cookie('CF_P', cookies['CloudFront-Policy'], cookieOptions);
    res.cookie('CF_K', cookies['CloudFront-Key-Pair-Id'], cookieOptions);
    res.cookie('CF_S', cookies['CloudFront-Signature'], cookieOptions);

    return { mpdUrl };
  }

  // @Query(() => [UserVideoResponse])
  // async suggestVideo(
  //   @gqlCurrentUser() user: { userId: string },
  // ) {
  //   const result = await this.videoService.suggestVideos(userId);
  //   return result as any;
  // }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => CommentContentResponse)
  async commentOnVideo(
    @Args('videoId') videoId: string,
    @gqlCurrentUser() user: { userId: string },
    @Args('content') content: string,
  ) {
    return await this.videoService.commentOnVideo(
      videoId,
      user.userId,
      content,
    );
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => [CommentContentResponse])
  async getVideoComments(
    @Args('videoId') videoId: string,
    @Args('cursorCreatedAt', { type: () => Date, nullable: true })
    cursorCreatedAt?: Date,
    @Args('cursorId', { type: () => String, nullable: true }) cursorId?: string,
  ): Promise<CommentContentResponse[]> {
    return await this.videoService.getVideoComments(
      videoId,
      cursorCreatedAt && cursorId
        ? { createdAt: cursorCreatedAt, id: cursorId }
        : undefined,
    );
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Boolean)
  async updateVideoHistory(
    @gqlCurrentUser() user: { userId: string },
    @Args('videoId', { type: () => Int, nullable: true }) videoId: string,
  ) {
    await this.videoService.updateVideoHistory(user.userId, videoId);
    return true;
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => LikeDislikeResponse)
  async likeOrDislikeVideo(
    @Args('videoId') videoId: string,
    @gqlCurrentUser() user: { userId: string },
    @Args('like') like: boolean,
  ): Promise<LikeDislikeResponse> {
    return await this.videoService.likeOrDislikeVideo(
      user.userId,
      videoId,
      like,
    );
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => SubscribeChannelResponse)
  async subscribeChannel(
    @Args('channelId') channelId: string,
    @gqlCurrentUser() user: { userId: string },
    @Args('subscribe') subscribe: boolean,
  ): Promise<SubscribeChannelResponse> {
    return await this.videoService.subscribeChannel(
      user.userId,
      channelId,
      subscribe,
    );
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => Boolean)
  async trackVideoWatchProgress(
    @Args('videoId') videoId: string,
    @gqlCurrentUser() user: { userId: string },
    @Args('pauseAt', { type: () => Int, nullable: true }) pauseAt?: number,
  ) {
    await this.videoService.trackVideoWatchProgress(
      user.userId,
      videoId,
      pauseAt,
    );
    return true;
  }
}
