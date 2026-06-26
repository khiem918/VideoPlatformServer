import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationInput } from '../dto/notificaton.input';

@Injectable()
export class NotificationRepository {
    constructor(
        private readonly prisma: PrismaService
    ) { }

    async createNotification(userId: string, notification_subject: string, payload: string, type: string) {
        if (type === "SYSTEM") {
            return await this.prisma.systemNotification.create({
                data: {
                    userId: userId,
                    notificationSubject: notification_subject,
                    content: payload,
                }

            });
        } else {
            return await this.prisma.channelNotification.create({
                data: {
                    channelId: userId,
                    notificationSubject: notification_subject,
                    content: payload,
                }
            });
        }
    }

    async markAsRead(notifyId: string, userId: string, type: "SYSTEM" | "CHANNEL") {
        if (type === "SYSTEM") {
            return await this.prisma.systemNotification.updateMany({
                where: {
                    id: notifyId,
                    userId: userId,
                },
                data: {
                    isRead: true,
                }
            });
        }

        return await this.prisma.channelNotification.updateMany({
            where: {
                id: notifyId,
                channelId: userId,
            },
            data: {
                isRead: true,
            }
        });
    }

    async getUnreadNotifications(userId: string) {
        const systemNotifications = await this.prisma.systemNotification.findMany({
            where: {
                userId: userId,
                isRead: false,
            },
        });

        const channelNotifications = await this.prisma.channelNotification.findMany({
            where: {
                channelId: userId,
                isRead: false,
            },
        });

        return [...systemNotifications, ...channelNotifications];
    }

    async getNotifications(userId: string) {
        const systemNotifications = await this.prisma.systemNotification.findMany({
            where: {
                userId: userId,
                createdAt : { 
                    gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), 
                }
            },
        });

        const channelNotifications = await this.prisma.channelNotification.findMany({
            where: {
                channelId: userId,
                createdAt : { 
                    gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), 
                }
            },
        });

        return [...systemNotifications, ...channelNotifications].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());   
    }

    async getSubscribedChannelUserIds(userId: string) {
        return await this.prisma.subscribe.findMany({
            where: {
                channelId: userId,
            },
            select: {
                userId: true,
            },
        });
    }
}