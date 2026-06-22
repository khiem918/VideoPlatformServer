import { IsString, IsNotEmpty, IsIn, Length } from 'class-validator';

export class TranscodingDataDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  uploadId: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 500)
  r2Path: string;

  @IsString()
  @IsNotEmpty()
  @IsIn([
    'video/mp4',
    'video/x-matroska',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
  ])
  mimeType: string;
}


export class TranscodingResponseDto {
  jobId: string;
  uploadId: string;
  status: string;
  progress?: number;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export class TranscodedVideoPaths {
  manifestPath: string;
  thumbnailPath: string;
  metadataPath: string;
};
