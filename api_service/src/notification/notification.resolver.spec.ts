import { NotificationResolver } from './notification.resolver';
import { NotificationService } from './notification.service';

function createNotificationServiceMock() {
  return {
    getNotifications: jest.fn(),
    sendNotification: jest.fn(),
  };
}

describe('NotificationResolver', () => {
  let resolver: NotificationResolver;
  let notificationService: ReturnType<typeof createNotificationServiceMock>;

  beforeEach(() => {
    notificationService = createNotificationServiceMock();

    resolver = new NotificationResolver(
      notificationService as unknown as NotificationService,
    );
  });

  describe('getNotification', () => {
    it('returns the notifications for the hardcoded demo user', async () => {
      notificationService.getNotifications.mockResolvedValue([
        { id: 'n-1', content: 'hello', isRead: false },
      ]);

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
