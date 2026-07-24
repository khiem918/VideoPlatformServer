jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}));

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockQueryRaw = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: class {
    $connect = mockConnect;
    $disconnect = mockDisconnect;
    $queryRaw = mockQueryRaw;
    constructor(_options: unknown) {}
  },
}));

import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    service = new PrismaService();
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('onModuleInit', () => {
    it('connects and verifies connectivity with a test query', async () => {
      mockConnect.mockResolvedValue(undefined);
      mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);

      await service.onModuleInit();

      expect(mockConnect).toHaveBeenCalled();
      expect(mockQueryRaw).toHaveBeenCalled();
    });

    it('rethrows when the connection fails', async () => {
      mockConnect.mockRejectedValue(new Error('connection refused'));

      await expect(service.onModuleInit()).rejects.toThrow(
        'connection refused',
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('disconnects the client', async () => {
      mockDisconnect.mockResolvedValue(undefined);

      await service.onModuleDestroy();

      expect(mockDisconnect).toHaveBeenCalled();
    });
  });
});
