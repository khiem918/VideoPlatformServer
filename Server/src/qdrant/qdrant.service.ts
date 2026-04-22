import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly qdrantClient: QdrantClient;
  private readonly logger = new Logger(QdrantService.name);
  
  private readonly COLLECTION_NAME = 'videos';
  
  private readonly VECTOR_SIZE = 768; 

  constructor() {
    this.qdrantClient = new QdrantClient({ 
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      checkCompatibility: false 
    });
  }

  async onModuleInit() {
    await this.initCollection();
  }

  private async initCollection() {
    try {
      const { collections } = await this.qdrantClient.getCollections();
      const exists = collections.some((c) => c.name === this.COLLECTION_NAME);

      if (!exists) {
        this.logger.log(`Creating Qdrant collection: ${this.COLLECTION_NAME}`);
        await this.qdrantClient.createCollection(this.COLLECTION_NAME, {
          vectors: {
            title: {
              size: this.VECTOR_SIZE,
              distance: 'Cosine',
            },
            desc: {
              size: this.VECTOR_SIZE,
              distance: 'Cosine',
            },
          },
        });
        this.logger.log('Collection created successfully with named vectors: title, desc.');
      } else {
        this.logger.log(`Collection ${this.COLLECTION_NAME} already exists.`);
      }
    } catch (error) {
      this.logger.error('Error initializing Qdrant collection', error);
      throw error;
    }
  }

  async upsertVideoVectors(
    videoId: string,
    titleVector: number[],
    descVector?: number[],
    payload?: Record<string, any>,
  ) {
    try {
      await this.qdrantClient.upsert(this.COLLECTION_NAME, {
        wait: true,
        points: [
          {
            id: videoId, 
            vector: {
              title: titleVector,
              ...(descVector && { desc: descVector }),
            },
            payload: {
              videoId, 
              ...payload,
            },
          },
        ],
      });
      
      this.logger.log(`Successfully upserted vectors for video: ${videoId}`);
    } catch (error) {
      this.logger.error(`Failed to upsert vectors for video ${videoId}`, error);
      throw error;
    }
  }


  async searchSimilarVideos(vector: number[], limit: number = 10) {
    try {

      const results = await this.qdrantClient.searchBatch(this.COLLECTION_NAME, {
        searches: [
          {
            vector: {
              name: 'title',
              vector: vector
            },
            limit: limit,
            with_payload: true, 
          }, 
          { 
            vector: {
              name: 'desc',
              vector: vector
            },
            limit: limit,
            with_payload: true, 
          }
        ]
      });

      return results;
    } catch (error) {
      this.logger.error(`Error searching video vectors`, error);
      throw error;
    }
  }
}