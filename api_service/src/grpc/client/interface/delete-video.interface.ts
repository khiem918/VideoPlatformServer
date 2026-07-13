import { Observable } from 'rxjs';

export enum DeleteVideoStatus {
  UNSPECIFIED = 0,
  FAILED = 1,
  SUCCEEDED = 2,
}

export interface GetDeleteVideoRequest {
  video_id: string;
}

export interface GetDeleteVideoResponse {
  status: DeleteVideoStatus;
}

export interface DeleteVideoServiceClient {
  getDeleteVideo(
    data: GetDeleteVideoRequest,
  ): Observable<GetDeleteVideoResponse>;
}
