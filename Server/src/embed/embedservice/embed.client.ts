export interface TagProcessRequest {
  videoId: string;
  textToEmbed: string;
}

export interface EmbeddingResponse {
  videoId: string;
  vector: number[];
}

export class EmbedClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = process.env.EMBED_API_URL || 'http://localhost:8000';
    this.apiKey = process.env.EMBED_API_KEY || 'default_api_key';
  }

  async generateVector(
    request: TagProcessRequest | TagProcessRequest[]
  ): Promise<EmbeddingResponse | EmbeddingResponse[]> {
    const response = await fetch(`${this.baseUrl}/api/vector/generate`, {
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
}