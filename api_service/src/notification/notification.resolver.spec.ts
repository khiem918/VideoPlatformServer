import { NotificationResolver } from './notification.resolver';
import { NotificationService } from './notification.service';

describe('NotificationResolver', () => {
  let resolver: NotificationResolver;
  let notificationService: jest.Mocked<NotificationService>;

  beforeEach(() => {
    notificationService = {
      getNotifications: jest.fn(),
      sendNotification: jest.fn(),
    } as unknown as jest.Mocked<NotificationService>;

    resolver = new NotificationResolver(notificationService);
  });

  describe('getNotification', () => {
    it('returns the notifications for the hardcoded demo user', async () => {
      notificationService.getNotifications.mockResolvedValue([
        { id: 'n-1', content: 'hello', isRead: false },
      ] as any);

      const result = await resolver.getNotification();

      expect(notificationService.getNotifications).toHaveBeenCalledWith(
        '@jrALUe0g',
      );
      expect(result).toEqual([{ id: 'n-1', content: 'hello', isRead: false }]);
    });
  });

  describe('sendTestNotification', () => {
    it('sends the notification and returns true', async () => {
      const result = await resolver.sendTestNotification(
        'subject',
        'payload',
        'SYSTEM',
      );

      expect(notificationService.sendNotification).toHaveBeenCalledWith(
        '@jrALUe0g',
        'subject',
        'payload',
        'SYSTEM',
      );
      expect(result).toBe(true);
    });
  });
});
