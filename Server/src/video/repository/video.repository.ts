import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { ProcessingStatus, UploadStatus, VideoVisibility, } from "@prisma/client";

@Injectable()
export class VideoRepository {
    constructor(private readonly prisma: PrismaService) { }

    async createVideoUpload(
        userId: string,
        fileName: string,
        fileSize: number,
        r2Path: string,
        mimeType: string,
    ) {

        return await this.prisma.videoUpload.create({
            data: {
                userId: userId,
                fileName: fileName,
                fileSize: fileSize,
                r2Path: r2Path,
                mimeType: mimeType,
                status: UploadStatus.PENDING,
            },
        });
    }

    async createVideo(
        userId: string,
        upLoadId: string,
        videoId: string,
    ) {
        return await this.prisma.video.create({
            data: {
                userOwner: userId,
                uploadId: upLoadId,
                duration: 0,
            },
        });
    }

    async initVideoUpload(
        userId: string,
        videoId: string,
        fileName: string,
        fileSize: number,
        r2Path: string,
        mimeType: string,
        videoUploadId: string,
    ): Promise<void> {
        return await this.prisma.$transaction(async (tx) => {
            await tx.videoUpload.create({
                data: {
                    id: videoUploadId,
                    userId: userId,
                    fileName: fileName,
                    fileSize: fileSize,
                    r2Path: r2Path,
                    mimeType: mimeType,
                    status: UploadStatus.PENDING,
                },
            });

            await tx.video.create({
                data: {
                    id: videoId,
                    userOwner: userId,
                    uploadId: videoUploadId,
                    duration: 0,
                },
            });
        });
    }


    async updateVideoStatus(uploadId: string, status: UploadStatus) {
        return await this.prisma.videoUpload.update({
            where: { id: uploadId },
            data: { status: status },
        });
    }

    async getVideoUpload(uploadId: string) {

        return await this.prisma.videoUpload.findUnique({
            where: { id: uploadId },
        });

    }

    async findUpload(userId: string, uploadId: string) {
        return await this.prisma.videoUpload.findFirst({
            where: { id: uploadId, userId: userId },
        });

    }

    async updateUploadStatus(userId: string, uploadId: string, status: UploadStatus) {
        return await this.prisma.videoUpload.updateMany({
            where: { id: uploadId, userId: userId },
            data: { status: status },
        });
    }

    async createVideoProcessing(videoUploadId: string) {
        return await this.prisma.videoProcessing.create({
            data: {
                videoUploadId: videoUploadId,
                status: ProcessingStatus.PENDING,
            },
        });
    }

    async getUserVideos(userId: string) {
        return await this.prisma.videoUpload.findMany({
            where: { userId: userId },
            include: {
                processing: true,
            },
        });
    }

    async deleteUploadByUserId(userId: string, uploadId: string): Promise<boolean> {
        const result = await this.prisma.videoUpload.deleteMany({
            where: {
                id: uploadId,
                userId: userId,
            },
        });

        return result.count > 0;
    }

    async getUserAllVideos(userId: string) {
        return await this.prisma.video.findMany({
            where: {
                userOwner: userId,
            },
            include: {
                videoHashtags: {
                    include: {
                        hashtag: true
                    }
                },
                upload: {
                    select: {
                        id: true,
                        fileName: true,
                        status: true,
                        uploadedAt: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

    }

    async updateVideo(userId: string, videoId: string, title?: string, description?: string, rawDescription?: string, visibility?: VideoVisibility) {
        return await this.prisma.video.update({
            where: {
                id: videoId,
                userOwner: userId,
            },
            data: {
                ...(title !== undefined && { videoName: title }),
                ...(description !== undefined && { videoDesc: description }),
                ...(rawDescription !== undefined && { rawDesc: rawDescription }),
                ...(visibility !== undefined && { visibility: visibility }),
            },
        });
    }

    async findVideoById(videoId: string, userId?: string) {
        return await this.prisma.video.findUnique({
            where: {
                id: videoId,
                ...(userId && { userOwner: userId })
            },
        });
    }

    async deleteVideo(userId: string, videoId: string) {
        return await this.prisma.video.delete({
            where: { id: videoId, userOwner: userId },
        });
    }


    async getVideoForWatching(userId: string, videoId: string) {
        const res1 =  await this.prisma.video.findUnique({
            where: { id: videoId },
            include: {
                owner: {
                    select: {
                        userName: true,
                        id: true,
                        subscribeCount: true,
                    }
                },
                videoHashtags: {
                    include: {
                        hashtag: true
                    }
                }
            }
        });

        const res2 = await this.prisma.likeVideo.findUnique({
            where: { userId_videoId: { userId, videoId } },
        });

        const res3 = await this.prisma.subscribe.findUnique({
            where: { userId_channelId: { userId, channelId: res1?.userOwner || '' } },
        });

        if (!res1) {
            return null;
        }

        return {
            res1, 
            res2,
            res3,        
        }
    }

    async incrementViewCount(videoId: string) {
        return await this.prisma.video.update({
            where: { id: videoId },
            data: {
                videoView: {
                    increment: 1
                }
            }
        });
    }

    async keywordSearch(query: string, limit: number): Promise<Array<{ id: string; rank: number }>> {
        return await this.prisma.$queryRaw<Array<{ id: string; rank: number }>>`
            SELECT id, ts_rank_cd(
                to_tsvector('english', "video_name" || ' ' || COALESCE("videoDesc", '')),
                plainto_tsquery('english', ${query})
            ) AS rank
            FROM core.video
            WHERE video_visibility = 'PUBLISHED'
                AND to_tsvector('english', "video_name" || ' ' || COALESCE("videoDesc", ''))
                    @@ plainto_tsquery('english', ${query})
            ORDER BY rank DESC
            LIMIT ${limit}
        `;
    }

    // async findManyByIds(ids: string[]) {
    //     return await this.prisma.video.findMany({
    //         where: { id: { in: ids }, visibility: 'PUBLISHED' },
    //         include: {
    //             owner: {
    //                 select: {
    //                     userName: true,
    //                     id: true,
    //                 }
    //             },
    //         }
    //     });
    // }

    // async markVideoAsFailed(videoId: string, reason: string) {
    //     return await this.prisma.video.update({
    //         where: { id: videoId },
    //         data: {
    //             fail_in: thi,
    //         },
    //     });
    // }

    async getVideoComments(videoId: string, cursor?: { createdAt: Date; id: bigint }) {
        return await this.prisma.comment.findMany({
            where: {
                videoId: videoId,
                parentId: null,
                ...(cursor && {
                    OR: [
                        { createdAt: { lt: cursor.createdAt } },
                        {
                            createdAt: cursor.createdAt,
                            id: { lt: cursor.id }
                        }
                    ]
                })
            },
            include: {
                user: {
                    select: {
                        userName: true,
                        id: true,
                    }
                }
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
                id: BigInt(Date.now()),
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
                    }
                },
            }   
        });
    }

    async updateHistory(userId: string, videoId: string, pauseAt?: number) {
        return await this.prisma.watchHistory.upsert({
            where: { userId_videoId: { userId, videoId } },
            update: { pausedAt: (pauseAt ? pauseAt : 0) },
            create: {
                userId,
                videoId,
                ...(pauseAt ? { pausedAt: pauseAt } : {}),
            },
        });
    }

    async getVideoStatus(userId: string, videoId: string) {
        return this.prisma.video.findUnique({
            where: { userOwner: userId, id: videoId },
            select: {
                visibility: true,
                upload: {
                    select: {
                        processing: {
                            select: {
                                status: true,
                            }
                        }
                    }
                }
            }
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
                }
            });
        }       
        if (existing && existing.isLike !== isLike) {
            await this.prisma.likeVideo.update({
                where: { userId_videoId: { userId, videoId } },
                data: { 
                    isLike: isLike 
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
                }
            });
        }

        await this.prisma.likeVideo.create({
            data: { userId, videoId, isLike },
        });

        return await this.prisma.video.update({
            where: { id: videoId },
            data: {
                ...(isLike ? { videoLike: { increment: 1 } } : { videoDislike: { increment: 1 } }),
            },
            select: {
                videoLike: true,
                videoDislike: true,
            }
        });
    }

    async subscribeChannel(userId: string, channelId: string, subscribe: boolean) {
        const existing = await this.prisma.subscribe.findUnique({
            where: { userId_channelId: { userId, channelId } },
        });

        if (existing && subscribe === true) {

            return await this.prisma.user.findUnique({
                where: { id: channelId },
                select: {
                    subscribeCount: true,
                }
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
                    }
                },
                select: {
                    subscribeCount: true,
                }
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
                }
            },
            select: {
                subscribeCount: true,
            }
        });
    }

}