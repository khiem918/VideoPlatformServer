import { NotificationService } from './notification.service';
import { NotificationRepository } from './repository/notification.repository';
import { RedisNotifyService } from './redis.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let repository: jest.Mocked<NotificationRepository>;
  let redisNotifyService: jest.Mocked<RedisNotifyService>;

  beforeEach(() => {
    repository = {
      createNotification: jest.fn(),
      getSubscribedChannelUserIds: jest.fn(),
      markAsRead: jest.fn(),
      getNotifications: jest.fn(),
      getUnreadNotifications: jest.fn(),
    } as unknown as jest.Mocked<NotificationRepository>;

    redisNotifyService = {
      publishToRedisStream: jest.fn(),
      ensureConsumerGroup: jest.fn(),
    } as unknown as jest.Mocked<RedisNotifyService>;

    service = new NotificationService(repository, redisNotifyService);
  });

  describe('subscribe', () => {
    it('creates a new subject for a user who has none yet', () => {
      const subject = service.subscribe('user-1');

      expect(subject).toBeDefined();
      expect(service.subscribe('user-1')).toBe(subject);
    });
  });

  describe('unsubscribe', () => {
    it('completes and removes the subject for a subscribed user', () => {
      const subject = service.subscribe('user-1');
      const completeSpy = jest.spyOn(subject, 'complete');

      service.unsubscribe('user-1');

      expect(completeSpy).toHaveBeenCalled();
      expect(service.subscribe('user-1')).not.toBe(subject);
    });

    it('does nothing when the user has no active subject', () => {
      expect(() => service.unsubscribe('missing-user')).not.toThrow();
    });
  });

  describe('pushToUser', () => {
    it('emits the event to a subscribed user', () => {
      const subject = service.subscribe('user-1');
      const nextSpy = jest.spyOn(subject, 'next');
      const event = {
        userId: 'user-1',
        type: 'SYSTEM',
        payload: 'hi',
        id: 'n-1',
      };

      service.pushToUser(event);

      expect(nextSpy).toHaveBeenCalledWith(event);
    });

    it('does nothing when the target user has no active subject', () => {
      const event = {
        userId: 'unknown',
        type: 'SYSTEM',
        payload: 'hi',
        id: 'n-1',
      };

      expect(() => service.pushToUser(event)).not.toThrow();
    });
  });

  describe('pushToDedicatedUser', () => {
    it('emits the event to every subscribed user in the list', () => {
      const subjectA = service.subscribe('user-a');
      const subjectB = service.subscribe('user-b');
      const nextSpyA = jest.spyOn(subjectA, 'next');
      const nextSpyB = jest.spyOn(subjectB, 'next');
      const event = {
        userId: 'ignored',
        type: 'SYSTEM',
        payload: 'hi',
        id: 'n-1',
      };

      service.pushToDedicatedUser(['user-a', 'user-b', 'user-c'], event);

      expect(nextSpyA).toHaveBeenCalledWith(event);
      expect(nextSpyB).toHaveBeenCalledWith(event);
    });
  });

  describe('sendNotification', () => {
    it('persists the notification and publishes it to the redis stream', async () => {
      repository.createNotification.mockResolvedValue({ id: 'notif-1' } as any);
      repository.getSubscribedChannelUserIds.mockResolvedValue([
        { userId: 'sub-1' },
      ] as any);

      await service.sendNotification('user-1', 'subject', 'payload', 'SYSTEM');

      expect(repository.createNotification).toHaveBeenCalledWith(
        'user-1',
        'subject',
        'payload',
        'SYSTEM',
      );
      expect(redisNotifyService.publishToRedisStream).toHaveBeenCalledWith(
        'notifications:stream',
        'user-1',
        'payload',
        'notif-1',
        'SYSTEM',
        'subject',
        ['sub-1', 'user-1'],
      );
    });
  });

  describe('markAsRead', () => {
    it('delegates to the repository', async () => {
      await service.markAsRead('notif-1', 'user-1', 'SYSTEM');

      expect(repository.markAsRead).toHaveBeenCalledWith(
        'notif-1',
        'user-1',
        'SYSTEM',
      );
    });
  });

  describe('getUnread', () => {
    it('returns notifications from the repository', async () => {
      repository.getNotifications.mockResolvedValue([{ id: 'n-1' }] as any);

      const result = await service.getUnread('user-1');

      expect(result).toEqual([{ id: 'n-1' }]);
    });
  });

  describe('ensureConsumerGroup', () => {
    it('delegates to the redis notify service', async () => {
      await service.ensureConsumerGroup();

      expect(redisNotifyService.ensureConsumerGroup).toHaveBeenCalledWith(
        'notifications:stream',
        'notify_wokers',
      );
    });
  });

  describe('getNotifications', () => {
    it('returns unread notifications from the repository', async () => {
      repository.getUnreadNotifications.mockResolvedValue([
        { id: 'n-1' },
      ] as any);

      const result = await service.getNotifications('user-1');

      expect(result).toEqual([{ id: 'n-1' }]);
    });
  });
});
