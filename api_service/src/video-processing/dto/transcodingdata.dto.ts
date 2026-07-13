import { IsString, IsNotEmpty, IsIn, Length } from 'class-validator';

export class TranscodingDataDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  inforId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  processingId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 500)
  r2Path!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn([
    'video/mp4',
    'video/x-matroska',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
  ])
  mimeType!: string;
}

export interface TranscodingResponse {
  jobId: string;
  inforId: string;
  status: string;
  progress?: number;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface TranscodedVideoPaths {
  manifestPath: string;
  thumbnailPath: string;
  metadataPath: string;
}
