import { VideoMetaDataGrpcController } from './video-metadata.controller';
import { VideoMetaDataGrpcService } from './video-metadata.service';

describe('VideoMetaDataGrpcController', () => {
  let controller: VideoMetaDataGrpcController;
  let service: jest.Mocked<VideoMetaDataGrpcService>;

  beforeEach(() => {
    service = {
      getVideoMetaData: jest.fn(),
    } as unknown as jest.Mocked<VideoMetaDataGrpcService>;

    controller = new VideoMetaDataGrpcController(service);
  });

  it('maps service results into the gRPC response shape', async () => {
    service.getVideoMetaData.mockResolvedValue([
      {
        videoId: 'video-1',
        videoName: 'title',
        videoView: 10,
        channel: 'channel name',
        thumbnailUrl: 'thumb.jpg',
        videoReleasedDate: new Date('2024-01-01'),
        videoDesc: 'desc',
        visibility: 'PUBLIC',
        duration: 120,
      },
    ] as any);

    const result = await controller.getVideoMetaData({ videoId: ['video-1'] });

    expect(service.getVideoMetaData).toHaveBeenCalledWith(['video-1']);
    expect(result).toEqual([
      {
        video_id: 'video-1',
        title: 'title',
        view: 10,
        channel: 'channel name',
        thumb_url: 'thumb.jpg',
        date: new Date('2024-01-01'),
        description: 'desc',
        visibility: 'PUBLIC',
        duration: 120,
      },
    ]);
  });

  it('returns an empty array when the service resolves no metadata', async () => {
    service.getVideoMetaData.mockResolvedValue([]);

    const result = await controller.getVideoMetaData({ videoId: [] });

    expect(result).toEqual([]);
  });
});
