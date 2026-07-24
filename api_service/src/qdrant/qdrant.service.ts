import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { VECTOR_NAMES, VideoPayload, VideoPoint } from './type/qdrant.types';

export interface VectorSearchParams {
  denseVector: number[];
  limit?: number;
  prefetchLimit?: number;
  filter?: Record<string, unknown>;
  scoreThreshold?: number;
  fusion?: 'rrf' | 'dbsf';
}

export interface VectorSearchHit {
  id: string;
  score: number;
  payload: Partial<VideoPayload>;
}

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly qdrantClient: QdrantClient;
  private readonly logger = new Logger(QdrantService.name);

  private readonly COLLECTION_NAME = 'videos';

  private readonly VECTOR_SIZE = 768;

  constructor() {
    // Workaround for Node 18+ undici dispatcher conflict
    // QdrantClient tries to inject its own dispatcher using a user-land undici
    // which fails inside Node's native fetch. We hide process.versions.node
    // temporarily so it doesn't create and inject the incompatible dispatcher.
    const nodeVersion = process.versions.node;
<<<<<<< HEAD
    Object.defineProperty(process.versions, 'node', { value: undefined, configurable: true });
=======
    Object.defineProperty(process.versions, 'node', {
      value: undefined,
      configurable: true,
    });
>>>>>>> main

    this.qdrantClient = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      checkCompatibility: false,
    });

<<<<<<< HEAD
    Object.defineProperty(process.versions, 'node', { value: nodeVersion, configurable: true });
=======
    Object.defineProperty(process.versions, 'node', {
      value: nodeVersion,
      configurable: true,
    });
>>>>>>> main
  }

  async onModuleInit() {
    await this.initCollection();
    await this.ensurePayloadIndexes();
  }

  private async initCollection() {
    try {
      const { collections } = await this.qdrantClient.getCollections();
      const exists = collections.some((c) => c.name === this.COLLECTION_NAME);

      if (!exists) {
        await this.qdrantClient.createCollection(this.COLLECTION_NAME, {
          vectors: {
            [VECTOR_NAMES.titleDense]: {
              size: this.VECTOR_SIZE,
              distance: 'Cosine',
            },
            [VECTOR_NAMES.descDense]: {
              size: this.VECTOR_SIZE,
              distance: 'Cosine',
            },
          },
          hnsw_config: {
            m: 32,
            ef_construction: 200,
            full_scan_threshold: 2000,
            on_disk: false,
          },
          optimizers_config: {
            memmap_threshold: 20000,
          },
        });
      } else {
        this.logger.log(`Collection ${this.COLLECTION_NAME} already exists.`);
      }
    } catch (error) {
      this.logger.error('Error initializing Qdrant collection', error);
      throw error;
    }
  }

  private async ensurePayloadIndexes() {
    const indexes: {
      field_name: string;
      field_schema: 'keyword' | 'integer';
    }[] = [
      { field_name: 'videoId', field_schema: 'keyword' },
      { field_name: 'userOwner', field_schema: 'keyword' },
      { field_name: 'createdAt', field_schema: 'integer' },
    ];

    for (const index of indexes) {
      try {
        await this.qdrantClient.createPayloadIndex(this.COLLECTION_NAME, {
          field_name: index.field_name,
          field_schema: index.field_schema,
          wait: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/already exists/i.test(message)) {
          this.logger.warn(
            `Failed to create payload index on ${index.field_name}: ${message}`,
          );
        }
      }
    }
  }

  async upsertVideoPoint(point: VideoPoint) {
    try {
      const vector: Record<string, number[]> = {
        [VECTOR_NAMES.titleDense]: point.vectors.titleDense,
        [VECTOR_NAMES.descDense]:
          point.vectors.descDense || point.vectors.titleDense,
      };

      await this.qdrantClient.upsert(this.COLLECTION_NAME, {
        wait: true,
        points: [
          {
            id: point.id,
            vector,
            payload: { ...point.payload },
          },
        ],
      });

      this.logger.log(`Successfully upserted point for video: ${point.id}`);
    } catch (error) {
      this.logger.error(`Failed to upsert point for video ${point.id}`, error);
      throw error;
    }
  }

  async vectorSearch(params: VectorSearchParams): Promise<VectorSearchHit[]> {
    const {
      denseVector,
      limit = 100,
      prefetchLimit,
      filter,
      scoreThreshold,
      fusion = 'dbsf',
    } = params;

    const prefetchCap = prefetchLimit ?? Math.max(limit * 4, 40);

    const prefetch: Array<Record<string, unknown>> = [
      {
        query: denseVector,
        using: VECTOR_NAMES.titleDense,
        limit: prefetchCap,
        ...(filter ? { filter } : {}),
      },
      {
        query: denseVector,
        using: VECTOR_NAMES.descDense,
        limit: prefetchCap,
        ...(filter ? { filter } : {}),
      },
    ];

    try {
      const response = await this.qdrantClient.query(this.COLLECTION_NAME, {
        prefetch,
        query: { fusion },
        limit,
        with_payload: true,
        ...(filter ? { filter } : {}),
        ...(scoreThreshold !== undefined
          ? { score_threshold: scoreThreshold }
          : {}),
      });

      return response.points.map((point) => ({
        id: String(point.id),
        score: point.score,
        payload: point.payload ?? {},
      }));
    } catch (error) {
      this.logger.error('Vector search failed', error);
      throw error;
    }
  }

  async deleteVideoVector(videoId: string) {
    try {
      await this.qdrantClient.delete(this.COLLECTION_NAME, {
        wait: true,
        points: [videoId],
      });
      this.logger.log(`Successfully deleted vector for video: ${videoId}`);
    } catch (error) {
      this.logger.error(`Failed to delete vector for video ${videoId}`, error);
      throw error;
    }
  }
}
