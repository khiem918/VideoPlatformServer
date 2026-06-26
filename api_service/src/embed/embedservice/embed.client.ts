import { Injectable } from '@nestjs/common';

export interface ProcessRequest {
  videoId: string;
  textToEmbed: string;
  isQuery?: boolean;
}

export interface EmbeddingResponse {
  videoId: string;
  vector: number[];
}

@Injectable()
export class EmbedClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = process.env.EMBED_API_URL || 'http://localhost:8090';
    this.apiKey = process.env.EMBED_API_KEY || 'default_api_key';
  }

  async generateVector(
    request: ProcessRequest | ProcessRequest[]
  ): Promise<EmbeddingResponse | EmbeddingResponse[]> {
    const response = await fetch(`${this.baseUrl}/vector/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorDetail = await response.text();
      throw new Error(`Failed to generate vector: ${response.status} - ${errorDetail}`);
    }

    return response.json();
  }

  async generateQueryVector(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/vector/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify([{ videoId: '__query__', textToEmbed: text, isQuery: true }]),
    });

    if (!response.ok) {
      const errorDetail = await response.text();
      throw new Error(`Failed to generate query vector: ${response.status} - ${errorDetail}`);
    }

    const data: EmbeddingResponse[] = await response.json();
    return data[0].vector;
  }
}