import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { DELETE_VIDEO_SERVICE_NAME, GRPC_CLIENT_PACKAGE } from '../constants';
import {
  DeleteVideoServiceClient,
  DeleteVideoStatus,
} from './interface/delete-video.interface';

@Injectable()
export class GrpcClientService implements OnModuleInit {
  private deleteVideoService!: DeleteVideoServiceClient;

  constructor(
    @Inject(GRPC_CLIENT_PACKAGE) private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.deleteVideoService = this.client.getService<DeleteVideoServiceClient>(
      DELETE_VIDEO_SERVICE_NAME,
    );
  }

  async deleteVideo(videoId: string): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.deleteVideoService.getDeleteVideo({ video_id: videoId }),
      );

      if (response.status !== DeleteVideoStatus.SUCCEEDED) {
        throw new InternalServerErrorException(
          `search_service failed to delete video ${videoId}`,
        );
      }
    } catch (error) {
      const grpcError = error as { code?: number; details?: string };

      if (grpcError.code === GrpcStatus.INVALID_ARGUMENT) {
        throw new BadRequestException(grpcError.details ?? 'Invalid video id');
      }

      throw new InternalServerErrorException(
        `search_service delete video call failed: ${grpcError.details ?? 'unknown error'}`,
      );
    }
  }
}
