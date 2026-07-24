import { NotificationRepository } from './notification.repository';
import { PrismaService } from 'src/prisma/prisma.service';

describe('NotificationRepository', () => {
  let repository: NotificationRepository;
  let prisma: {
    systemNotification: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
    };
    channelNotification: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
    };
    subscribe: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      systemNotification: {
        create: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      channelNotification: {
        create: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      subscribe: {
        findMany: jest.fn(),
      },
    };

    repository = new NotificationRepository(prisma as unknown as PrismaService);
  });

  describe('createNotification', () => {
    it('creates a system notification when type is SYSTEM', async () => {
      prisma.systemNotification.create.mockResolvedValue({ id: 'n-1' });

      const result = await repository.createNotification(
        'user-1',
        'subject',
        'payload',
        'SYSTEM',
      );

      expect(prisma.systemNotification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          notificationSubject: 'subject',
          content: 'payload',
        },
      });
      expect(prisma.channelNotification.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'n-1' });
    });

    it('creates a channel notification when type is not SYSTEM', async () => {
      prisma.channelNotification.create.mockResolvedValue({ id: 'n-2' });

      const result = await repository.createNotification(
        'channel-1',
        'subject',
        'payload',
        'CHANNEL',
      );

      expect(prisma.channelNotification.create).toHaveBeenCalledWith({
        data: {
          channelId: 'channel-1',
          notificationSubject: 'subject',
          content: 'payload',
        },
      });
      expect(result).toEqual({ id: 'n-2' });
    });
  });

  describe('markAsRead', () => {
    it('marks a system notification as read', async () => {
      prisma.systemNotification.updateMany.mockResolvedValue({ count: 1 });

      await repository.markAsRead('notif-1', 'user-1', 'SYSTEM');

      expect(prisma.systemNotification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'user-1' },
        data: { isRead: true },
      });
    });

    it('marks a channel notification as read', async () => {
      prisma.channelNotification.updateMany.mockResolvedValue({ count: 1 });

      await repository.markAsRead('notif-1', 'user-1', 'CHANNEL');

      expect(prisma.channelNotification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', channelId: 'user-1' },
        data: { isRead: true },
      });
    });
  });

  describe('getUnreadNotifications', () => {
    it('merges unread system and channel notifications', async () => {
      prisma.systemNotification.findMany.mockResolvedValue([{ id: 'sys-1' }]);
      prisma.channelNotification.findMany.mockResolvedValue([{ id: 'chan-1' }]);

      const result = await repository.getUnreadNotifications('user-1');

      expect(result).toEqual([{ id: 'sys-1' }, { id: 'chan-1' }]);
    });

    it('returns an empty array when there are no unread notifications', async () => {
      prisma.systemNotification.findMany.mockResolvedValue([]);
      prisma.channelNotification.findMany.mockResolvedValue([]);

      const result = await repository.getUnreadNotifications('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('getNotifications', () => {
    it('returns recent notifications sorted by most recent first', async () => {
      const older = {
        id: 'sys-1',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      };
      const newer = {
        id: 'chan-1',
        createdAt: new Date('2024-01-02T00:00:00Z'),
      };
      prisma.systemNotification.findMany.mockResolvedValue([older]);
      prisma.channelNotification.findMany.mockResolvedValue([newer]);

      const result = await repository.getNotifications('user-1');

      expect(result).toEqual([newer, older]);
    });
  });

  describe('getSubscribedChannelUserIds', () => {
    it('returns the user ids subscribed to a channel', async () => {
      prisma.subscribe.findMany.mockResolvedValue([{ userId: 'sub-1' }]);

      const result = await repository.getSubscribedChannelUserIds('channel-1');

      expect(prisma.subscribe.findMany).toHaveBeenCalledWith({
        where: { channelId: 'channel-1' },
        select: { userId: true },
      });
      expect(result).toEqual([{ userId: 'sub-1' }]);
    });
  });
});
