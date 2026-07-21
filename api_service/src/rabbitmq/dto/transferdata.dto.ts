import { IsString, IsNotEmpty } from 'class-validator';

export class TransferVideoMetaDataResponse {
  @IsString()
  @IsNotEmpty()
  correlationId!: string;

  @IsString()
  @IsNotEmpty()
  status!: 'succeeded' | 'failed';

  @IsString()
  error?: string;
}
