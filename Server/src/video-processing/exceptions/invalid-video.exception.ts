import { BadRequestException } from '@nestjs/common';

export class InvalidVideoException extends BadRequestException {
  constructor(
    message: string,
    public readonly uploadId: string,
  ) {
    super({
      error: 'INVALID_VIDEO',
      message,
      uploadId,
      retryable: false,
    });
  }
}
