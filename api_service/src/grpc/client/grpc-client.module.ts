import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import {
  GRPC_PACKAGE,
  GRPC_PROTO_PATH,
  GRPC_CLIENT_PACKAGE,
} from '../constants';
import { GrpcClientService } from './grpc-client.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: GRPC_CLIENT_PACKAGE,
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: GRPC_PACKAGE,
            protoPath: GRPC_PROTO_PATH,
            url: config.get<string>('SEARCH_SERVICE_GRPC_URL'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [GrpcClientService],
  exports: [GrpcClientService],
})
export class GrpcClientModule {}
