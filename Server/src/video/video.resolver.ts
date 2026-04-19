import { UseGuards } from '@nestjs/common/decorators/core/use-guards.decorator';
import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { CurrentUser } from 'src/auth/decorator/current-user.decorator';
import { GqlAuthGuard } from 'src/auth/guard/gql-auth.guard';
import { VideoService } from './video.service';
import { InitUploadResponse } from './dto/init-upload.response';
import { UserVideosListResponse, UserVideoResponse } from './dto/user-videos.response';

@Resolver()
export class VideoResolver {

  constructor(private readonly videoService: VideoService) { }

  @Query(() => String)
  hello() {
    return 'hello';
  }

  @Mutation(() => InitUploadResponse)
  // @UseGuards(GqlAuthGuard)
  async initUploadVideo(
      // @CurrentUser() user: { userId: string },
      @Args('fileName') fileName: string,
      @Args('fileSize') fileSize: number,
      @Args('mimeType') mimeType: string,
  ) : Promise<InitUploadResponse> {
    const uploadData = await this.videoService.initUpload(
      // user.userId,
      "@jrALUe0g",
      fileName,
      mimeType,
      fileSize,
    );

    return { 
      videoId: uploadData.videoId,
      presignedUrl: uploadData.presignedUrl,
      uploadId: uploadData.uploadId,
    };
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async completeUploadVideo(
    @CurrentUser() user: { userId: string },
    @Args('uploadId') uploadId: string,
  ): Promise<boolean> {
    await this.videoService.completeUpload(user.userId, uploadId);
    // await this.videoService.completeUpload("@jrALUe0g", uploadId);
    return true;
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async deleteVideoUpload(
    @CurrentUser() user: { userId: string },
    @Args('uploadId') uploadId: string,
  ): Promise<boolean> {
    await this.videoService.deleteVideo(user.userId, uploadId);
    return true;
  }

  @Query(() => UserVideosListResponse)
  @UseGuards(GqlAuthGuard)
  async getUserVideos(
    @CurrentUser() user: { userId: string },
  ): Promise<UserVideosListResponse> {
    const result = await this.videoService.getUserVideos(
      user.userId,
      // "@jrALUe0g",
    );
    return result as any;
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async updateVideo(
    @CurrentUser() user: { userId: string },
    @Args('videoId') videoId: string,
    @Args('title') title: string,
    @Args('tags', { type: () => [String] }) tags: string[],
    @Args('description') description: string,
    @Args('visibility') visibility: string,

  ): Promise<boolean> {
    
    await this.videoService.updateVideo(user.userId, videoId, title, tags, description, visibility as 'DRAFT' | 'PRIVATE' | 'PUBLISHED');
    return true;
  }

  @Mutation(() => Boolean)
  // @UseGuards(GqlAuthGuard) 
  async deleteVideo(
    // @CurrentUser() user: { userId: string },
    @Args('videoId') videoId: string,
  ): Promise<boolean> {
    // await this.videoService.deleteVideo(user.userId, uploadId);
    await this.videoService.deleteVideo("@jrALUe0g", videoId);
    return true;
  }

  @Query(() => UserVideoResponse)
  async watchVideo(
    @Args('videoId') videoId: string,
    @Args('userId', { nullable: true }) qUserId?: string,
  ): Promise<UserVideoResponse> {
    // Using simple argument for userId to track views/permissions, typically you would extract this from req context/token @CurrentUser() but making it nullable for unauthenticated users.
    const result = await this.videoService.watchVideo(videoId, qUserId);
    return result as any;
  }
}
