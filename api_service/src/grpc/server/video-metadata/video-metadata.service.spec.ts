import { RpcException } from '@nestjs/microservices/exceptions/rpc-exception';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { VideoVisibility } from '@prisma/client';
import { VideoMetaDataGrpcService } from './video-metadata.service';
import { VideoMetaDatarepository } from './repository/video-metadata.repository';

describe('VideoMetaDataGrpcService', () => {
  let service: VideoMetaDataGrpcService;
  let repository: jest.Mocked<VideoMetaDatarepository>;

  beforeEach(() => {
    repository = {
      getVideoMetaData: jest.fn(),
    } as unknown as jest.Mocked<VideoMetaDatarepository>;

    service = new VideoMetaDataGrpcService(repository);
  });

  it('queries only public videos and maps the response shape', async () => {
    repository.getVideoMetaData.mockResolvedValue([
      {
        id: 'video-1',
        videoName: 'title',
        videoView: 10,
        thumbnailUrl: 'thumb.jpg',
        videoReleasedDate: new Date('2024-01-01'),
        videoDesc: 'a'.repeat(80),
        visibility: 'PUBLIC',
        duration: 120,
        owner: { id: 'owner-1', userName: 'owner name' },
      },
    ] as any);

    const result = await service.getVideoMetaData(['video-1']);

    expect(repository.getVideoMetaData).toHaveBeenCalledWith(
      ['video-1'],
      VideoVisibility.PUBLIC,
    );
    expect(result).toEqual([
      expect.objectContaining({
        videoId: 'video-1',
        videoName: 'title',
        channel: 'owner name',
        videoDesc: 'a'.repeat(50),
      }),
    ]);
  });

  it('falls back to the owner id when there is no username', async () => {
    repository.getVideoMetaData.mockResolvedValue([
      {
        id: 'video-1',
        videoName: 'title',
        videoView: 10,
        thumbnailUrl: 'thumb.jpg',
        videoReleasedDate: new Date('2024-01-01'),
        videoDesc: 'short desc',
        visibility: 'PUBLIC',
        duration: 120,
        owner: { id: 'owner-1', userName: null },
      },
    ] as any);

    const result = await service.getVideoMetaData(['video-1']);

    expect(result[0].channel).toBe('owner-1');
  });

  it('throws an RpcException with NOT_FOUND when the repository returns no rows', async () => {
    repository.getVideoMetaData.mockResolvedValue(null as any);

    await expect(service.getVideoMetaData(['missing'])).rejects.toThrow(
      RpcException,
    );

    try {
      await service.getVideoMetaData(['missing']);
    } catch (error) {
      expect((error as RpcException).getError()).toEqual(
        expect.objectContaining({ code: GrpcStatus.NOT_FOUND }),
      );
    }
  });

  it('returns an empty array without throwing when the repository returns an empty list', async () => {
    repository.getVideoMetaData.mockResolvedValue([]);

    const result = await service.getVideoMetaData(['video-1']);

    expect(result).toEqual([]);
  });
});
