import { of, throwError } from 'rxjs';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import type { ClientGrpc } from '@nestjs/microservices';
import { GrpcClientService } from './grpc-client.service';
import { DeleteVideoStatus } from './interface/delete-video.interface';

describe('GrpcClientService', () => {
  let service: GrpcClientService;
  let getDeleteVideo: jest.Mock;
  let client: jest.Mocked<ClientGrpc>;

  beforeEach(() => {
    getDeleteVideo = jest.fn();
    client = {
      getService: jest.fn().mockReturnValue({ getDeleteVideo }),
    } as unknown as jest.Mocked<ClientGrpc>;

    service = new GrpcClientService(client);
    service.onModuleInit();
  });

  it('resolves when the search service reports success', async () => {
    getDeleteVideo.mockReturnValue(of({ status: DeleteVideoStatus.SUCCEEDED }));

    await expect(service.deleteVideo('video-1')).resolves.toBeUndefined();
    expect(getDeleteVideo).toHaveBeenCalledWith({ video_id: 'video-1' });
  });

  it('throws InternalServerErrorException when the response status is not SUCCEEDED', async () => {
    getDeleteVideo.mockReturnValue(of({ status: DeleteVideoStatus.FAILED }));

    await expect(service.deleteVideo('video-1')).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('throws BadRequestException when the gRPC call reports INVALID_ARGUMENT', async () => {
    getDeleteVideo.mockReturnValue(
      throwError(() => ({
        code: GrpcStatus.INVALID_ARGUMENT,
        details: 'invalid video id',
      })),
    );

    await expect(service.deleteVideo('bad-id')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws InternalServerErrorException for any other gRPC error', async () => {
    getDeleteVideo.mockReturnValue(
      throwError(() => ({ code: GrpcStatus.UNAVAILABLE, details: 'down' })),
    );

    await expect(service.deleteVideo('video-1')).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
