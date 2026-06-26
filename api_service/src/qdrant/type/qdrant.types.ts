export interface VideoPayload {
  videoId: string;
  userOwner: string;
  title: string;
  description?: string | null;
  createdAt: number;
}

export interface VideoPointVectors {
  titleDense: number[];
  descDense?: number[];
}

export interface VideoPoint {
  id: string;
  payload: VideoPayload;
  vectors: VideoPointVectors;
}

export const VECTOR_NAMES = {
  titleDense: 'title',
  descDense: 'desc',
} as const;


export interface VectorSearchParams {
  denseVector: number[];
  limit?: number;
  prefetchLimit?: number;
  filter?: Record<string, unknown>;
  scoreThreshold?: number;
  fusion?: 'rrf' | 'dbsf';
}
