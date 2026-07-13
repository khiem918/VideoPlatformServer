import { firstValueFrom, Subject, take, toArray } from 'rxjs';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

describe('NotificationController', () => {
  let controller: NotificationController;
  let notificationService: jest.Mocked<NotificationService>;

  beforeEach(() => {
    notificationService = {
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    } as unknown as jest.Mocked<NotificationService>;

    controller = new NotificationController(notificationService);
  });

  it('subscribes the user and maps events into SSE message events', async () => {
    const subject = new Subject<{
      id: string;
      userId: string;
      type: string;
      payload: string;
    }>();
    notificationService.subscribe.mockReturnValue(subject as any);

    const resultPromise = firstValueFrom(
      controller.stream({ userId: 'user-1' }).pipe(take(1)),
    );

    subject.next({
      id: 'n-1',
      userId: 'user-1',
      type: 'SYSTEM',
      payload: 'hi',
    });

    const event = await resultPromise;

    expect(notificationService.subscribe).toHaveBeenCalledWith('user-1');
    expect(event).toEqual({
      data: JSON.stringify({
        id: 'n-1',
        userId: 'user-1',
        type: 'SYSTEM',
        payload: 'hi',
      }),
      type: 'notification',
      id: 'n-1',
    });
  });

  it('unsubscribes the user once the stream completes', async () => {
    const subject = new Subject<any>();
    notificationService.subscribe.mockReturnValue(subject as any);

    const resultPromise = firstValueFrom(
      controller.stream({ userId: 'user-1' }).pipe(toArray()),
    );

    subject.complete();
    await resultPromise;

    expect(notificationService.unsubscribe).toHaveBeenCalledWith('user-1');
  });
});
