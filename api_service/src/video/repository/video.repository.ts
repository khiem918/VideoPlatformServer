import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ProcessingStatus,
  UploadVideoStatus,
  VideoVisibility,
  VideoStatus,
  ProcessingType,
} from '@prisma/client';

@Injectable()
export class VideoRepository {
  constructor(private readonly prisma: PrismaService) { }

  async initVideoUpload(
    userId: string,
    videoId: string,
    fileName: string,
    fileSize: number,
    objectPath: string,
    mimeType: string,
  ) {
    return await this.prisma.$transaction(async (tx) => {
      await tx.video.create({
        data: {
          id: videoId,
          userId: userId,
        },
      });

      await tx.videoInformation.create({
        data: {
          videoId: videoId,
          fileName: fileName,
          fileSize: fileSize,
          objectPath: objectPath,
          mimeType: mimeType,
          videoStatus: UploadVideoStatus.PENDING,
        },
      });
    });
  }

  async updateVideoInfo(
    videoId: string,
    mimeType?: string,
    fileName?: string,
    fileSize?: number,
    objectPath?: string,
    videoStatus?: UploadVideoStatus,
    videoMetaStatus?: UploadVideoStatus,
  ) {
    return await this.prisma.videoInformation.update({
      where: { videoId: videoId },
      data: {
        ...(mimeType !== undefined && { mimeType: mimeType }),
        ...(fileName !== undefined && { fileName: fileName }),
        ...(fileSize !== undefined && { fileSize: fileSize }),
        ...(objectPath !== undefined && { objectPath: objectPath }),
        ...(videoStatus !== undefined && { videoStatus: videoStatus }),
        ...(videoMetaStatus !== undefined && {
          videoMetaStatus: videoMetaStatus,
        }),
      },
    });
  }

  async createVideoProcessing(videoId: string, type: ProcessingType) {
    return await this.prisma.videoProcessing.create({
      data: {
        videoId: videoId,
        processingType: type,
        status: ProcessingStatus.PROCESSING,
      },
    });
  }

  async getUserAllVideos(userId: string) {
    return await this.prisma.video.findMany({
      where: {
        userId: userId,
      },
      include: {
        videoHashtags: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async updateVideo(
    userId: string,
    videoId: string,
    title?: string,
    description?: string,
    visibility?: VideoVisibility,
    status?: VideoStatus,
  ) {
    return await this.prisma.video.update({
      where: {
        id: videoId,
        userId: userId,
      },
      data: {
        ...(title !== undefined && { videoName: title }),
        ...(description !== undefined && { videoDesc: description }),
        ...(visibility !== undefined && { visibility: visibility }),
        ...(status !== undefined && { videoStatus: status }),
      },
    });
  }

  async findVideo(videoId: string, userId?: string) {
    return await this.prisma.video.findUnique({
      where: {
        id: videoId,
        ...(userId && { userId: userId }),
      },
      include: {
        information: true,
      },
    });
  }

  async deleteVideo(userId: string, videoId: string) {
    return await this.prisma.video.delete({
      where: { id: videoId, userId: userId },
    });
  }

  async getVideoForWatching(userId: string, videoId: string) {
    const res1 = await this.prisma.video.findUnique({
      where: { id: videoId },
      include: {
        owner: {
          select: {
            userName: true,
            id: true,
            subscribeCount: true,
          },
        },
        videoHashtags: true,
      },
    });

    const res2 = await this.prisma.likeVideo.findUnique({
      where: { userId_videoId: { userId, videoId } },
    });

    const res3 = await this.prisma.subscribe.findUnique({
      where: { userId_channelId: { userId, channelId: res1?.userId || '' } },
    });

    if (!res1) {
      return null;
    }

    return {
      res1,
      res2,
      res3,
    };
  }

  async incrementViewCount(videoId: string) {
    return await this.prisma.video.update({
      where: { id: videoId },
      data: {
        videoView: {
          increment: 1,
        },
      },
    });
  }

  async updateHistory(userId: string, videoId: string, pauseAt?: number) {
    return await this.prisma.watchHistory.upsert({
      where: { userId_videoId: { userId, videoId } },
      update: { pausedAt: pauseAt ? pauseAt : 0 },
      create: {
        userId,
        videoId,
        ...(pauseAt ? { pausedAt: pauseAt } : {}),
      },
    });
  }

  async watchVideo(userId: string, videoId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.watchHistory.upsert({
        where: { userId_videoId: { userId, videoId } },
        update: { pausedAt: 0 },
        create: {
          userId,
          videoId,
          pausedAt: 0,
        },
      });

      await tx.video.update({
        where: { id: videoId },
        data: {
          videoView: {
            increment: 1,
          },
        },
      });
    });
  }

  async getVideoComments(
    videoId: string,
    cursor?: { createdAt: Date; id: string },
  ) {
    return await this.prisma.comment.findMany({
      where: {
        videoId: videoId,
        parentId: null,
        ...(cursor && {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            {
              createdAt: cursor.createdAt,
              id: { lt: cursor.id },
            },
          ],
        }),
      },
      include: {
        user: {
          select: {
            userName: true,
            id: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 20,
    });
  }

  async createComment(videoId: string, userId: string, content: string) {
    return await this.prisma.comment.create({
      data: {
        videoId: videoId,
        userId: userId,
        content: content,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        user: {
          select: {
            userName: true,
            id: true,
          },
        },
      },
    });
  }

  async likeOrDislikeVideo(userId: string, videoId: string, isLike: boolean) {
    const existing = await this.prisma.likeVideo.findUnique({
      where: { userId_videoId: { userId, videoId } },
    });

    if (existing && existing.isLike === isLike) {
      return await this.prisma.video.findUnique({
        where: { id: videoId },
        select: {
          videoLike: true,
          videoDislike: true,
        },
      });
    }
    if (existing && existing.isLike !== isLike) {
      await this.prisma.likeVideo.update({
        where: { userId_videoId: { userId, videoId } },
        data: {
          isLike: isLike,
        },
      });

      return await this.prisma.video.update({
        where: { id: videoId },
        data: {
          ...(isLike
            ? { videoLike: { increment: 1 }, videoDislike: { decrement: 1 } }
            : { videoLike: { decrement: 1 }, videoDislike: { increment: 1 } }),
        },
        select: {
          videoLike: true,
          videoDislike: true,
        },
      });
    }

    await this.prisma.likeVideo.create({
      data: { userId, videoId, isLike },
    });

    return await this.prisma.video.update({
      where: { id: videoId },
      data: {
        ...(isLike
          ? { videoLike: { increment: 1 } }
          : { videoDislike: { increment: 1 } }),
      },
      select: {
        videoLike: true,
        videoDislike: true,
      },
    });
  }

  async subscribeChannel(
    userId: string,
    channelId: string,
    subscribe: boolean,
  ) {
    const existing = await this.prisma.subscribe.findUnique({
      where: { userId_channelId: { userId, channelId } },
    });

    if (existing && subscribe === true) {
      return await this.prisma.user.findUnique({
        where: { id: channelId },
        select: {
          subscribeCount: true,
        },
      });
    }

    if (existing && subscribe === false) {
      await this.prisma.subscribe.delete({
        where: { userId_channelId: { userId, channelId } },
      });

      return await this.prisma.user.update({
        where: { id: channelId },
        data: {
          subscribeCount: {
            decrement: 1,
          },
        },
        select: {
          subscribeCount: true,
        },
      });
    }

    await this.prisma.subscribe.create({
      data: { userId, channelId },
    });

    return await this.prisma.user.update({
      where: { id: channelId },
      data: {
        subscribeCount: {
          increment: 1,
        },
      },
      select: {
        subscribeCount: true,
      },
    });
  }
}
