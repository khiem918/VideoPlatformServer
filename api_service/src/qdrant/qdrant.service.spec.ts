const mockGetCollections = jest.fn();
const mockCreateCollection = jest.fn();
const mockCreatePayloadIndex = jest.fn();
const mockUpsert = jest.fn();
const mockQuery = jest.fn();
const mockDelete = jest.fn();

jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn().mockImplementation(() => ({
    getCollections: mockGetCollections,
    createCollection: mockCreateCollection,
    createPayloadIndex: mockCreatePayloadIndex,
    upsert: mockUpsert,
    query: mockQuery,
    delete: mockDelete,
  })),
}));

import { QdrantService } from './qdrant.service';
import { VideoPoint } from './type/qdrant.types';

interface UpsertCallArgs {
  points: Array<{ vector: { desc?: number[]; title?: number[] } }>;
}

describe('QdrantService', () => {
  let service: QdrantService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new QdrantService();
  });

  describe('onModuleInit', () => {
    it('creates the collection and payload indexes when the collection does not exist', async () => {
      mockGetCollections.mockResolvedValue({ collections: [] });
      mockCreateCollection.mockResolvedValue(undefined);
      mockCreatePayloadIndex.mockResolvedValue(undefined);

      await service.onModuleInit();

      const vectorsMatcher: unknown = expect.any(Object);
      expect(mockCreateCollection).toHaveBeenCalledWith(
        'videos',
        expect.objectContaining({ vectors: vectorsMatcher }),
      );
      expect(mockCreatePayloadIndex).toHaveBeenCalledTimes(3);
    });

    it('skips collection creation when it already exists', async () => {
      mockGetCollections.mockResolvedValue({
        collections: [{ name: 'videos' }],
      });
      mockCreatePayloadIndex.mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(mockCreateCollection).not.toHaveBeenCalled();
    });

    it('swallows "already exists" errors when creating payload indexes', async () => {
      mockGetCollections.mockResolvedValue({
        collections: [{ name: 'videos' }],
      });
      mockCreatePayloadIndex.mockRejectedValue(
        new Error('index already exists'),
      );

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    it('rethrows when initializing the collection fails unexpectedly', async () => {
      mockGetCollections.mockRejectedValue(new Error('qdrant down'));

      await expect(service.onModuleInit()).rejects.toThrow('qdrant down');
    });
  });

  describe('upsertVideoPoint', () => {
    it('upserts a point with both dense vectors set', async () => {
      mockUpsert.mockResolvedValue(undefined);

      await service.upsertVideoPoint({
        id: 'video-1',
        vectors: { titleDense: [0.1, 0.2], descDense: [0.3, 0.4] },
        payload: { videoId: 'video-1' },
      } as unknown as VideoPoint);

      expect(mockUpsert).toHaveBeenCalledWith(
        'videos',
        expect.objectContaining({
          points: [
            expect.objectContaining({
              id: 'video-1',
              payload: { videoId: 'video-1' },
            }),
          ],
        }),
      );
    });

    it('falls back to titleDense when descDense is not provided', async () => {
      mockUpsert.mockResolvedValue(undefined);

      await service.upsertVideoPoint({
        id: 'video-1',
        vectors: { titleDense: [0.1, 0.2] },
        payload: {},
      } as unknown as VideoPoint);

      const calls = mockUpsert.mock.calls as unknown as [
        string,
        UpsertCallArgs,
      ][];
      const call = calls[0][1];
      expect(call.points[0].vector.desc).toEqual([0.1, 0.2]);
      expect(call.points[0].vector.title).toEqual([0.1, 0.2]);
    });

    it('rethrows when the upsert fails', async () => {
      mockUpsert.mockRejectedValue(new Error('upsert failed'));

      await expect(
        service.upsertVideoPoint({
          id: 'video-1',
          vectors: { titleDense: [0.1] },
          payload: {},
        } as unknown as VideoPoint),
      ).rejects.toThrow('upsert failed');
    });
  });

  describe('vectorSearch', () => {
    it('returns mapped hits using the default fusion strategy', async () => {
      mockQuery.mockResolvedValue({
        points: [
          { id: 'video-1', score: 0.9, payload: { videoId: 'video-1' } },
        ],
      });

      const result = await service.vectorSearch({ denseVector: [0.1, 0.2] });

      expect(mockQuery).toHaveBeenCalledWith(
        'videos',
        expect.objectContaining({ query: { fusion: 'dbsf' }, limit: 100 }),
      );
      expect(result).toEqual([
        { id: 'video-1', score: 0.9, payload: { videoId: 'video-1' } },
      ]);
    });

    it('defaults the payload to an empty object when missing', async () => {
      mockQuery.mockResolvedValue({
        points: [{ id: 'video-1', score: 0.5, payload: null }],
      });

      const result = await service.vectorSearch({ denseVector: [0.1] });

      expect(result[0].payload).toEqual({});
    });

    it('rethrows when the query fails', async () => {
      mockQuery.mockRejectedValue(new Error('query failed'));

      await expect(
        service.vectorSearch({ denseVector: [0.1] }),
      ).rejects.toThrow('query failed');
    });
  });

  describe('deleteVideoVector', () => {
    it('deletes the point by video id', async () => {
      mockDelete.mockResolvedValue(undefined);

      await service.deleteVideoVector('video-1');

      expect(mockDelete).toHaveBeenCalledWith(
        'videos',
        expect.objectContaining({ points: ['video-1'] }),
      );
    });

    it('rethrows when deletion fails', async () => {
      mockDelete.mockRejectedValue(new Error('delete failed'));

      await expect(service.deleteVideoVector('video-1')).rejects.toThrow(
        'delete failed',
      );
    });
  });
});
