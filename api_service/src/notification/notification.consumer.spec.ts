import { NotificationConsumer } from './notification.consumer';
import { NotificationService } from './notification.service';
import { RedisNotifyService } from './redis.service';

interface ConsumerInternals {
  running: boolean;
  handleMessage: (id: string, fields: string[]) => Promise<void>;
}

function createNotificationServiceMock() {
  return {
    ensureConsumerGroup: jest.fn().mockResolvedValue(undefined),
    pushToDedicatedUser: jest.fn(),
  };
}

function createRedisNotifyServiceMock() {
  return {
    consumeFromRedisStream: jest.fn(),
    acknowledgeMessage: jest.fn().mockResolvedValue(undefined),
  };
}

async function flushPromises(times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('NotificationConsumer', () => {
  let consumer: NotificationConsumer;
  let internals: ConsumerInternals;
  let notificationService: ReturnType<typeof createNotificationServiceMock>;
  let redisNotifyService: ReturnType<typeof createRedisNotifyServiceMock>;
  let setTimeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    notificationService = createNotificationServiceMock();
    redisNotifyService = createRedisNotifyServiceMock();

    consumer = new NotificationConsumer(
      notificationService as unknown as NotificationService,
      redisNotifyService as unknown as RedisNotifyService,
    );
    internals = consumer as unknown as ConsumerInternals;

    setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      callback: () => void,
    ) => {
      callback();
      return 0;
    }) as unknown as typeof setTimeout);
  });

  afterEach(() => {
    internals.running = false;
    setTimeoutSpy.mockRestore();
  });

  describe('onModuleInit', () => {
    it('ensures the consumer group and begins polling the stream', async () => {
      redisNotifyService.consumeFromRedisStream.mockImplementation(() => {
        internals.running = false;
        return [];
      });

      await consumer.onModuleInit();
      await flushPromises();

      expect(notificationService.ensureConsumerGroup).toHaveBeenCalled();
      expect(redisNotifyService.consumeFromRedisStream).toHaveBeenCalledWith(
        'notifications:stream',
        'notify_wokers',
        expect.stringContaining('worker-'),
        10,
        2000,
      );
    });

    it('processes a batch of messages and dispatches them to subscribers', async () => {
      let callCount = 0;
      redisNotifyService.consumeFromRedisStream.mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          return [
            [
              'notifications:stream',
              [
                [
                  'msg-1',
                  [
                    'userId',
                    'user-1',
                    'payload',
                    'hello',
                    'type',
                    'SYSTEM',
                    'targetUserIds',
                    '["user-1"]',
                  ],
                ],
              ],
            ],
          ];
        }
        internals.running = false;
        return [];
      });

      await consumer.onModuleInit();
      await flushPromises();

      expect(notificationService.pushToDedicatedUser).toHaveBeenCalledWith(
        ['user-1'],
        { userId: 'user-1', type: 'SYSTEM', payload: 'hello', id: 'msg-1' },
      );
      expect(redisNotifyService.acknowledgeMessage).toHaveBeenCalledWith(
        'notifications:stream',
        'notify_wokers',
        'msg-1',
      );
    });

    it('waits and retries when consuming the stream throws', async () => {
      let callCount = 0;
      redisNotifyService.consumeFromRedisStream.mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error('stream unavailable');
        }
        internals.running = false;
        return [];
      });

      await consumer.onModuleInit();
      await flushPromises();

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
      expect(redisNotifyService.consumeFromRedisStream).toHaveBeenCalledTimes(
        2,
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('stops the polling loop', () => {
      internals.running = true;

      consumer.onModuleDestroy();

      expect(internals.running).toBe(false);
    });
  });

  describe('handleMessage', () => {
    it('parses fields, dispatches the event, and acknowledges the message', async () => {
      const fields = [
        'userId',
        'user-1',
        'payload',
        'hello',
        'type',
        'SYSTEM',
        'targetUserIds',
        '["user-1","user-2"]',
        'id',
        'notif-1',
      ];

      await internals.handleMessage('msg-1', fields);

      expect(notificationService.pushToDedicatedUser).toHaveBeenCalledWith(
        ['user-1', 'user-2'],
        { userId: 'user-1', type: 'SYSTEM', payload: 'hello', id: 'notif-1' },
      );
      expect(redisNotifyService.acknowledgeMessage).toHaveBeenCalledWith(
        'notifications:stream',
        'notify_wokers',
        'msg-1',
      );
    });

    it('defaults targetUserIds to an empty array when the field is missing', async () => {
      const fields = ['userId', 'user-1', 'payload', 'hello', 'type', 'SYSTEM'];

      await internals.handleMessage('msg-1', fields);

      expect(notificationService.pushToDedicatedUser).toHaveBeenCalledWith([], {
        userId: 'user-1',
        type: 'SYSTEM',
        payload: 'hello',
        id: 'msg-1',
      });
    });

    it('logs the error and does not acknowledge when the payload cannot be parsed', async () => {
      const fields = [
        'userId',
        'user-1',
        'payload',
        'hello',
        'type',
        'SYSTEM',
        'targetUserIds',
        'not-json',
      ];

      await internals.handleMessage('msg-1', fields);

      expect(notificationService.pushToDedicatedUser).not.toHaveBeenCalled();
      expect(redisNotifyService.acknowledgeMessage).not.toHaveBeenCalled();
    });
  });
});
