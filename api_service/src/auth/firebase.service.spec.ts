import { ConfigService } from '@nestjs/config';
import { FirebaseService } from './firebase.service';

const mockCert = jest.fn((options) => ({ options }));
const mockInitializeApp = jest.fn();
const mockGetApp = jest.fn();
const mockGetApps = jest.fn();
const mockVerifyIdToken = jest.fn();
const mockGetAuth = jest.fn((app?: unknown) => ({ verifyIdToken: mockVerifyIdToken }));

jest.mock('firebase-admin/app', () => ({
  cert: (options: unknown) => mockCert(options),
  initializeApp: (options: unknown) => mockInitializeApp(options),
  getApp: () => mockGetApp(),
  getApps: () => mockGetApps(),
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: (app: unknown) => mockGetAuth(app),
}));

describe('FirebaseService', () => {
  let service: FirebaseService;
  let config: jest.Mocked<ConfigService>;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetApps.mockReturnValue([]);
    mockInitializeApp.mockReturnValue({ name: 'app' });
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          FIREBASE_PRIVATE_KEY: 'line1\\nline2',
          FIREBASE_PROJECT_ID: 'project-id',
          FIREBASE_CLIENT_EMAIL: 'client@example.com',
        };
        return values[key];
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new FirebaseService(config);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('onModuleInit', () => {
    it('reuses the existing app when firebase is already initialized', () => {
      mockGetApps.mockReturnValue([{ name: 'existing-app' }]);
      mockGetApp.mockReturnValue({ name: 'existing-app' });

      service.onModuleInit();

      expect(mockGetApp).toHaveBeenCalled();
      expect(mockInitializeApp).not.toHaveBeenCalled();
    });

    it('warns and skips initialization when the private key is missing', () => {
      config.get.mockImplementation((key: string) => {
        const values: Record<string, string | undefined> = {
          FIREBASE_PRIVATE_KEY: undefined,
        };
        return values[key];
      });

      service.onModuleInit();

      expect(warnSpy).toHaveBeenCalled();
      expect(mockInitializeApp).not.toHaveBeenCalled();
    });

    it('warns and skips initialization when the private key is a placeholder', () => {
      config.get.mockImplementation((key: string) => {
        const values: Record<string, string> = {
          FIREBASE_PRIVATE_KEY: '...placeholder...',
        };
        return values[key];
      });

      service.onModuleInit();

      expect(warnSpy).toHaveBeenCalled();
      expect(mockInitializeApp).not.toHaveBeenCalled();
    });

    it('initializes the firebase app with normalized newlines when config is valid', () => {
      service.onModuleInit();

      expect(mockCert).toHaveBeenCalledWith({
        projectId: 'project-id',
        clientEmail: 'client@example.com',
        privateKey: 'line1\nline2',
      });
      expect(mockInitializeApp).toHaveBeenCalled();
    });
  });

  describe('verifyIdToken', () => {
    it('throws when firebase has not been initialized', () => {
      expect(() => service.verifyIdToken('token')).toThrow(
        'Firebase is not initialized. Check FIREBASE_PRIVATE_KEY in .env',
      );
    });

    it('delegates to firebase-admin verifyIdToken once initialized', async () => {
      mockVerifyIdToken.mockResolvedValue({ email: 'user@example.com' });
      service.onModuleInit();

      const result = await service.verifyIdToken('token');

      expect(mockVerifyIdToken).toHaveBeenCalledWith('token');
      expect(result).toEqual({ email: 'user@example.com' });
    });
  });
});
