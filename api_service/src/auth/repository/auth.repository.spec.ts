import { AuthRepository } from './auth.repository';
import { PrismaService } from 'src/prisma/prisma.service';

describe('AuthRepository', () => {
  let repository: AuthRepository;
  let prisma: { user: { upsert: jest.Mock; findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = {
      user: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    repository = new AuthRepository(prisma as unknown as PrismaService);
  });

  describe('findByEmail', () => {
    it('upserts the user by email and returns their id', async () => {
      prisma.user.upsert.mockResolvedValue({ id: 'user-1' });

      const result = await repository.findByEmail('user@example.com');

      expect(prisma.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userEmail: 'user@example.com' },
          update: {},
        }),
      );
      expect(result).toEqual({ id: 'user-1' });
    });

    it('throws a descriptive error when the upsert fails', async () => {
      prisma.user.upsert.mockRejectedValue(new Error('db error'));

      await expect(repository.findByEmail('user@example.com')).rejects.toThrow(
        'Error occurred while finding user by email',
      );
    });
  });

  describe('findById', () => {
    it('returns the user when found', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        userEmail: 'user@example.com',
      });

      const result = await repository.findById('user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { id: true, userEmail: true },
      });
      expect(result).toEqual({ id: 'user-1', userEmail: 'user@example.com' });
    });

    it('returns null when the user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await repository.findById('missing-user');

      expect(result).toBeNull();
    });

    it('throws a descriptive error when the lookup fails', async () => {
      prisma.user.findUnique.mockRejectedValue(new Error('db error'));

      await expect(repository.findById('user-1')).rejects.toThrow(
        'Error occurred while finding user by ID',
      );
    });
  });
});
