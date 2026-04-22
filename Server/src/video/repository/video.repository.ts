import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { ProcessingStatus, UploadStatus, VideoVisibility,  } from "@prisma/client";

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
        return await this.prisma.video.updateMany({
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


    async getVideoForWatching(videoId: string) {
        return await this.prisma.video.findUnique({
            where: { id: videoId },
            include: {
                owner: {
                    select: {
                        userName: true,
                        id: true,
                    }
                },
                videoHashtags: {
                    include: {
                        hashtag: true
                    }
                }
            }
        });
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

    async findManyByIds(userId: string, ids: string[]) {
        return await this.prisma.video.findMany({
            where: { id: { in: ids } },
            include: {
                owner: {
                    select: {
                        userName: true,
                        id: true,
                    }
                },
                videoHashtags: {
                    include: { hashtag: true }
                }, 
            }
        });
    }

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
                id : BigInt(Date.now()), 
                videoId: videoId,
                userId: userId,
                content: content,
            },
        });
    }
}
