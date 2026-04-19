import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { join } from 'path';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { AuthModule } from './auth/auth.module';
import type { Request, Response } from 'express';
import { RedisModule } from './session/session.module';
import { S3Service } from './s3/s3.service';
import { VideoProcessingModule } from './video-processing/video-processing.module';
import { QueueModule } from './queue/queue.module';
import { validateEnv } from './config/env.validation';
import { VideoModule } from './video/video.module';
import { EmbedModule } from './embed/embed.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    VideoProcessingModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: false,
      plugins: [ApolloServerPluginLandingPageLocalDefault()],
      context: ({ req, res }: { req: Request; res: Response }) => ({
        req,
        res,
      }),
    }),
    RedisModule,
    AuthModule,
    QueueModule,
    VideoModule,
    EmbedModule,
  ],
  controllers: [],
  providers: [AppService, S3Service],
})
export class AppModule {}
