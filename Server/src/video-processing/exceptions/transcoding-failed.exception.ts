import { InternalServerErrorException } from '@nestjs/common';

export class TranscodingFailedException extends InternalServerErrorException {
  constructor(
    message: string,
    public readonly uploadId: string,
    public readonly retryable: boolean = true,
  ) {
    super({
      error: 'TRANSCODING_FAILED',
      message,
      uploadId,
      retryable,
    });
  }
}
