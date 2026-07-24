import { VideoMetaDatarepository } from './video-metadata.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import { VideoVisibility } from '@prisma/client';

describe('VideoMetaDatarepository', () => {
  let repository: VideoMetaDatarepository;
  let prisma: { video: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = { video: { findMany: jest.fn() } };
    repository = new VideoMetaDatarepository(
      prisma as unknown as PrismaService,
    );
  });

  it('queries videos by id without a visibility filter when none is provided', async () => {
    prisma.video.findMany.mockResolvedValue([]);

    await repository.getVideoMetaData(['video-1']);

    expect(prisma.video.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['video-1'] } },
      }),
    );
  });

  it('applies the visibility filter when provided', async () => {
    prisma.video.findMany.mockResolvedValue([{ id: 'video-1' }]);

    const result = await repository.getVideoMetaData(
      ['video-1'],
      VideoVisibility.PUBLIC,
    );

    expect(prisma.video.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['video-1'] }, visibility: VideoVisibility.PUBLIC },
      }),
    );
    expect(result).toEqual([{ id: 'video-1' }]);
  });
});
