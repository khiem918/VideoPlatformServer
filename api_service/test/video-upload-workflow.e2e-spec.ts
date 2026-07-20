/**
 * E2E tests for the full "upload a video" workflow, end to end, against a
 * real ~170MB 4K video file on disk.
 *
 * Scope:
 *   Step 1: GraphQL `initUploadVideo` (src/video/video.resolver.ts) ->
 *   VideoService.initUpload -> S3Service.getPresignedUploadUrl -> a real
 *   HTTP PUT of the real file to the live S3/R2 bucket configured in
 *   api_service/.env -> GraphQL `completeUploadVideo` ->
 *   VideoService.completeUpload -> VideoProcessingQueueService enqueues a
 *   real BullMQ job on the `video-processing` queue, which the live
 *   `VideoProcessingHandler` (src/video-processing/video-processing.handler.ts,
 *   wired into this same AppModule) picks up and runs REAL ffmpeg
 *   transcoding + thumbnail extraction against the real uploaded file,
 *   re-uploading DASH segments and a thumbnail back to the same bucket.
 *
 *   Step 2: GraphQL `updateVideo` -> VideoService.updateVideo ->
 *   PublisherService.transferVideoMetadata -> RabbitMQ exchange
 *   `video.processing`, routing key `video.metadata.trans`. This suite pins
 *   the exact wire-contract payload api_service puts on that exchange
 *   (`{ correlationId, videoId, title, description, hashtags }`), the same
 *   contract search_service/tests/e2e/test_video_upload_workflow_e2e.py
 *   replays against the real consumer to verify data handling on the
 *   search_service side.
 *
 * PREREQUISITES (live infrastructure required, no mocking of
 * Postgres/Redis/RabbitMQ/S3):
 *   1. Start Postgres + Redis + RabbitMQ: `docker/dev.sh start` (uses
 *      `docker/docker-compose.api-service.yml`).
 *   2. `api_service/.env` must point at those services (DATABASE_URL,
 *      REDIS_HOST/PORT, RABBITMQ_URI, JWT_SECRET) AND at a real, reachable
 *      S3-compatible bucket (S3_*, BUCKET_NAME) -- this suite performs a
 *      real upload/download/delete cycle against that bucket. Prisma
 *      migrations must be applied (`npx prisma migrate deploy`).
 *   3. The fixture video below must exist on disk locally; this suite is
 *      not meant to run in CI without it.
 *   4. Run with: `npm run test:e2e -- video-upload-workflow.e2e-spec.ts`
 *      Real ffmpeg transcoding of a ~3 minute 4K clip can take several
 *      minutes; the suite raises Jest's timeout accordingly.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { randomUUID } from 'crypto';
import * as amqp from 'amqplib';
import * as jwt from 'jsonwebtoken';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3Service } from 'src/s3/s3.service';
import { UploadVideoStatus } from '@prisma/client';

const VIDEO_FILE_PATH =
  '/home/khiem918/Documents/Project/VideoPlatformServer/3MinutesofOppenheimerin4K _IMAX_2160p.mp4';
const VIDEO_MIME_TYPE = 'video/mp4';

const EXCHANGE = 'video.processing';
const ROUTING_KEY = 'video.metadata.trans';
const MESSAGE_WAIT_TIMEOUT_MS = 5000;
const TRANSCODE_POLL_INTERVAL_MS = 3000;
const TRANSCODE_TIMEOUT_MS = 10 * 60 * 1000;

jest.setTimeout(15 * 60 * 1000);

interface TransferVideoMetadataMessage {
  correlationId: string;
  videoId: string;
  title?: string;
  description?: string;
  hashtags?: string[];
}

function signUserToken(userId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured for the test run');
  }
  // Mirrors JwtStrategy.validate() (src/auth/strategy/jwt.strategy.ts),
  // which only requires `userId` plus a valid, non-expired `exp` claim.
  return jwt.sign({ userId }, secret, { expiresIn: '1h' });
}

// Presigned URLs point at the real S3/R2 host, not this app's own HTTP
// server, so this streams the real file directly with Node's core `https`
// module instead of supertest (which only targets `app.getHttpServer()`).
function putFileToPresignedUrl(
  presignedUrl: string,
  filePath: string,
  contentType: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const { size } = fs.statSync(filePath);
    const target = new URL(presignedUrl);

    const req = https.request(
      target,
      {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': size,
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );

    req.on('error', reject);
    fs.createReadStream(filePath).pipe(req);
  });
}

const INIT_UPLOAD_MUTATION = `
  mutation InitUploadVideo($fileName: String!, $fileSize: Float!, $mimeType: String!) {
    initUploadVideo(fileName: $fileName, fileSize: $fileSize, mimeType: $mimeType) {
      videoId
      presignedUrl
    }
  }
`;

const COMPLETE_UPLOAD_MUTATION = `
  mutation CompleteUploadVideo($uploadId: String!) {
    completeUploadVideo(uploadId: $uploadId)
  }
`;

const UPDATE_VIDEO_MUTATION = `
  mutation UpdateVideo(
    $videoId: String!
    $title: String!
    $tags: [String!]
    $description: String
    $visibility: String!
  ) {
    updateVideo(
      videoId: $videoId
      title: $title
      tags: $tags
      description: $description
      visibility: $visibility
    ) {
      id
      videoName
      rawDesc
      visibility
      tags
    }
  }
`;

describe('Upload video workflow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let s3Service: S3Service;
  let amqpConnection: amqp.ChannelModel;
  let channel: amqp.Channel;
  let testQueue: string;

  const seededUserIds: string[] = [];
  const seededVideoIds: string[] = [];

  beforeAll(async () => {
    if (!fs.existsSync(VIDEO_FILE_PATH)) {
      throw new Error(
        `Fixture video not found at "${VIDEO_FILE_PATH}". This suite requires ` +
          'the real file to exist locally and is not meant to run without it.',
      );
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    s3Service = app.get(S3Service);

    amqpConnection = await amqp.connect(
      process.env.RABBITMQ_URI ?? 'amqp://guest:guest@localhost:5672',
    );
  });

  afterAll(async () => {
    await amqpConnection.close();
    await app.close();
  });

  beforeEach(async () => {
    channel = await amqpConnection.createChannel();
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

    const { queue } = await channel.assertQueue('', {
      exclusive: true,
      autoDelete: true,
    });
    testQueue = queue;
    await channel.bindQueue(testQueue, EXCHANGE, ROUTING_KEY);
  });

  afterEach(async () => {
    await channel.close();

    for (const videoId of seededVideoIds) {
      await s3Service
        .deleteDirectory(s3Service.buildPrivatePrefix(videoId))
        .catch(() => undefined);
      await s3Service
        .deleteDirectory(s3Service.buildPublicPrefix(videoId))
        .catch(() => undefined);
    }

    await prisma.video.deleteMany({ where: { id: { in: seededVideoIds } } });
    await prisma.user.deleteMany({ where: { id: { in: seededUserIds } } });
    seededVideoIds.length = 0;
    seededUserIds.length = 0;
  });

  async function waitForMessage(): Promise<TransferVideoMetadataMessage | null> {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, MESSAGE_WAIT_TIMEOUT_MS);

      void channel.consume(
        testQueue,
        (msg) => {
          if (!msg || settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          channel.ack(msg);
          resolve(
            JSON.parse(msg.content.toString()) as TransferVideoMetadataMessage,
          );
        },
        { noAck: false },
      );
    });
  }

  async function seedUser(): Promise<string> {
    const userId = `test-user-${randomUUID()}`;
    await prisma.user.create({
      data: {
        id: userId,
        userEmail: `${userId}@example.com`,
      },
    });
    seededUserIds.push(userId);
    return userId;
  }

  async function pollUntilTranscodingFinished(videoId: string) {
    const deadline = Date.now() + TRANSCODE_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const info = await prisma.videoInformation.findUnique({
        where: { videoId },
      });

      if (
        info?.videoStatus === UploadVideoStatus.PROCESSED ||
        info?.videoStatus === UploadVideoStatus.FAILED
      ) {
        return info;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, TRANSCODE_POLL_INTERVAL_MS),
      );
    }

    throw new Error(
      `Timed out after ${TRANSCODE_TIMEOUT_MS}ms waiting for video ${videoId} to finish transcoding`,
    );
  }

  it('uploads the real video to S3, completes real transcoding, then publishes the metadata wire contract to search_service', async () => {
    const ownerId = await seedUser();
    const token = signUserToken(ownerId);

    const fileName = path.basename(VIDEO_FILE_PATH);
    const { size: fileSize } = fs.statSync(VIDEO_FILE_PATH);

    // --- Step 1: init upload, then a real PUT of the real file to S3 ---
    const initResponse = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: INIT_UPLOAD_MUTATION,
        variables: { fileName, fileSize, mimeType: VIDEO_MIME_TYPE },
      })
      .expect(200);

    expect(initResponse.body.errors).toBeUndefined();
    const { videoId, presignedUrl } = initResponse.body.data.initUploadVideo;

    seededVideoIds.push(videoId);

    const putStatus = await putFileToPresignedUrl(
      presignedUrl,
      VIDEO_FILE_PATH,
      VIDEO_MIME_TYPE,
    );
    expect(putStatus).toBe(200);

    const infoAfterUpload = await prisma.videoInformation.findUnique({
      where: { videoId },
    });
    expect(infoAfterUpload).not.toBeNull();
    await expect(
      s3Service.fileExists(infoAfterUpload!.objectPath),
    ).resolves.toBe(true);

    // --- Step 1b: complete upload, letting the live BullMQ worker run real ffmpeg transcoding ---
    const completeResponse = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: COMPLETE_UPLOAD_MUTATION,
        variables: { uploadId: videoId },
      })
      .expect(200);

    expect(completeResponse.body.errors).toBeUndefined();
    expect(completeResponse.body.data.completeUploadVideo).toBe(true);

    const processedInfo = await pollUntilTranscodingFinished(videoId);
    expect(processedInfo?.videoStatus).toBe(UploadVideoStatus.PROCESSED);

    const processedVideo = await prisma.video.findUnique({
      where: { id: videoId },
    });
    expect(processedVideo?.videoPath).toBeTruthy();
    expect(processedVideo?.thumbnailPath).toBeTruthy();
    expect(processedVideo?.duration).toBeGreaterThan(0);
    await expect(s3Service.fileExists(processedVideo!.videoPath)).resolves.toBe(
      true,
    );
    await expect(
      s3Service.fileExists(processedVideo!.thumbnailPath),
    ).resolves.toBe(true);

    // --- Step 2: metadata update, pinning the wire contract search_service consumes ---
    const messagePromise = waitForMessage();

    const title = 'Oppenheimer 4K IMAX clip';
    const description =
      'A 3 minute 4K IMAX excerpt from Oppenheimer, used as the upload-workflow e2e fixture.';
    const tags = ['oppenheimer', 'imax', '4k'];

    const updateResponse = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: UPDATE_VIDEO_MUTATION,
        variables: { videoId, title, tags, description, visibility: 'PUBLIC' },
      })
      .expect(200);

    expect(updateResponse.body.errors).toBeUndefined();
    expect(updateResponse.body.data.updateVideo).toMatchObject({
      id: videoId,
      videoName: title,
      rawDesc: description,
      visibility: 'PUBLIC',
      tags,
    });

    const message = await messagePromise;
    expect(message).toEqual({
      correlationId: videoId,
      videoId,
      title,
      description,
      hashtags: tags,
    });
  });
});
