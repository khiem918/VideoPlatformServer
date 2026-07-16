/**
 * E2E tests for the "update video metadata" flow.
 *
 * Scope: GraphQL `updateVideo` mutation (src/video/video.resolver.ts) ->
 * VideoService.updateVideo (src/video/video.service.ts) ->
 * PublisherService.transferVideoMetadata (src/rabbitmq/publisher.service.ts)
 * -> RabbitMQ exchange `video.processing`, routing key `video.metadata.trans`.
 *
 * PREREQUISITES (live infrastructure required, no mocking of Postgres/RabbitMQ):
 *   1. Start Postgres + RabbitMQ: `docker/dev.sh start` (uses
 *      `docker/docker-compose.api-service.yml`, Postgres on :5434, RabbitMQ on
 *      :5672).
 *   2. Ensure `api_service/.env` points at those services (DATABASE_URL,
 *      RABBITMQ_URI, JWT_SECRET) and Prisma migrations have been applied
 *      (`npx prisma migrate deploy`).
 *   3. Run with: `npm run test:e2e -- video-metadata-update.e2e-spec.ts`
 *
 * This suite pins the exact wire contract that `PublisherService` puts on the
 * `video.processing` exchange (message shape: `{ correlationId, videoId,
 * title, description, hashtags }`), so the Python search_service e2e suite
 * (search_service/tests/e2e/test_video_metadata_update_e2e.py) can replay the
 * same payload shape against the real consumer and demonstrate the
 * `desc` vs `description` field-name mismatch (bug #1) end-to-end.
 *
 * A previously-present bug (#5: explicit visibility changes were silently
 * discarded) has been fixed in video.service.ts; see the "honors an
 * explicitly requested visibility change" test below for the regression
 * guard.
 */
import { randomUUID } from 'crypto';
import * as amqp from 'amqplib';
import * as jwt from 'jsonwebtoken';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { VideoVisibility, VideoStatus } from '@prisma/client';

const EXCHANGE = 'video.processing';
const ROUTING_KEY = 'video.metadata.trans';
const MESSAGE_WAIT_TIMEOUT_MS = 5000;

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

describe('Update video metadata (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let amqpConnection: amqp.ChannelModel;
  let channel: amqp.Channel;
  let testQueue: string;

  const seededUserIds: string[] = [];
  const seededVideoIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

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
    // Same exchange declaration as rabbitmq.module.ts (topic, durable).
    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

    // Independent, exclusive queue so this suite observes the exact bytes
    // api_service puts on the wire, instead of introspecting internal
    // NestJS RabbitMQ client state.
    const { queue } = await channel.assertQueue('', {
      exclusive: true,
      autoDelete: true,
    });
    testQueue = queue;
    await channel.bindQueue(testQueue, EXCHANGE, ROUTING_KEY);
  });

  afterEach(async () => {
    await channel.close();

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

  async function seedVideo(
    userId: string,
    overrides: {
      visibility?: VideoVisibility;
      videoStatus?: VideoStatus;
      videoName?: string;
    } = {},
  ): Promise<string> {
    const videoId = `test-video-${randomUUID()}`;
    await prisma.video.create({
      data: {
        id: videoId,
        userId,
        videoName: overrides.videoName ?? 'Original title',
        visibility: overrides.visibility ?? VideoVisibility.PRIVATE,
        videoStatus: overrides.videoStatus ?? VideoStatus.AVAILABLE,
      },
    });
    await prisma.videoInformation.create({
      data: {
        videoId,
        mimeType: 'video/mp4',
        fileName: `${videoId}.mp4`,
        fileSize: 1024,
        r2Path: `videos/${videoId}/original.mp4`,
      },
    });
    seededVideoIds.push(videoId);
    return videoId;
  }

  it('publishes the exact wire-contract payload and persists changes on the happy path', async () => {
    const ownerId = await seedUser();
    const videoId = await seedVideo(ownerId, {
      videoStatus: VideoStatus.AVAILABLE,
      visibility: VideoVisibility.PRIVATE,
    });
    const token = signUserToken(ownerId);
    const messagePromise = waitForMessage();

    const response = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: UPDATE_VIDEO_MUTATION,
        variables: {
          videoId,
          title: 'Updated Title',
          tags: ['music', 'live'],
          description: 'Updated description',
          visibility: 'PUBLIC',
        },
      })
      .expect(200);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.updateVideo).toMatchObject({
      id: videoId,
      videoName: 'Updated Title',
      rawDesc: 'Updated description',
      visibility: 'PUBLIC',
      tags: ['music', 'live'],
    });

    const persisted = await prisma.video.findUnique({ where: { id: videoId } });
    expect(persisted?.videoName).toBe('Updated Title');
    expect(persisted?.videoDesc).toBe('Updated description');
    expect(persisted?.visibility).toBe(VideoVisibility.PUBLIC);

    // Pin the real wire contract: publisher.service.ts sends `description`
    // and `hashtags` (see interface/transferdata.interface.ts), NOT
    // `desc`/`tags`. search_service's consumer.py reads `payload.get('desc')`
    // (bug #1), so it never actually sees this description even though it
    // was published correctly here.
    const message = await messagePromise;
    expect(message).toEqual({
      correlationId: videoId,
      videoId,
      title: 'Updated Title',
      description: 'Updated description',
      hashtags: ['music', 'live'],
    });
  });

  it('forces visibility to DRAFT when the video is still PROCESSING, regardless of prior visibility', async () => {
    const ownerId = await seedUser();
    const videoId = await seedVideo(ownerId, {
      videoStatus: VideoStatus.PROCESSING,
      visibility: VideoVisibility.PUBLIC,
    });
    const token = signUserToken(ownerId);

    // The GraphQL schema declares `visibility: String!` (non-null), so the
    // mutation cannot literally omit the argument. Passing "" reproduces
    // "no visibility requested": VideoService.updateVideo only branches on
    // the JS truthiness of `visibility` (video.service.ts:231), and "" is
    // falsy, so it takes the same code path as an omitted argument.
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: UPDATE_VIDEO_MUTATION,
        variables: {
          videoId,
          title: 'Still processing',
          tags: null,
          description: null,
          visibility: '',
        },
      })
      .expect(200);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.updateVideo.visibility).toBe('DRAFT');

    const persisted = await prisma.video.findUnique({ where: { id: videoId } });
    expect(persisted?.visibility).toBe(VideoVisibility.DRAFT);
  });

  it('rejects updates from a non-owner and publishes nothing', async () => {
    const ownerId = await seedUser();
    const attackerId = await seedUser();
    const videoId = await seedVideo(ownerId);
    const attackerToken = signUserToken(attackerId);
    const messagePromise = waitForMessage();

    const response = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({
        query: UPDATE_VIDEO_MUTATION,
        variables: {
          videoId,
          title: 'Hijacked title',
          tags: null,
          description: null,
          visibility: 'PUBLIC',
        },
      })
      .expect(200);

    expect(response.body.errors).toBeDefined();
    expect(response.body.data?.updateVideo ?? null).toBeNull();

    const message = await messagePromise;
    expect(message).toBeNull();

    const persisted = await prisma.video.findUnique({ where: { id: videoId } });
    expect(persisted?.videoName).not.toBe('Hijacked title');
  });

  it('BUG #4 regression: no VideoProcessing row exists for the correlationId the publisher used', async () => {
    // publisher.service.ts:16 sets `correlationId = videoId` (the Video's
    // id), never a VideoProcessing.id. TransferDataRepository.updateProcessingStatus
    // (src/rabbitmq/repository/transferdata.repository.ts) updates
    // `videoProcessing` via `{ where: { id: processingId } }` using that same
    // correlationId. Because a metadata-only update never creates a
    // VideoProcessing row, this query always resolves to nothing, so a
    // response handler could never mark this correlationId "successed" even
    // if the RabbitMQ wire bugs (#1-#3) were fixed.
    const ownerId = await seedUser();
    const videoId = await seedVideo(ownerId, {
      videoStatus: VideoStatus.AVAILABLE,
    });
    const token = signUserToken(ownerId);

    await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: UPDATE_VIDEO_MUTATION,
        variables: {
          videoId,
          title: 'Whatever',
          tags: null,
          description: null,
          visibility: 'PUBLIC',
        },
      })
      .expect(200);

    const processingRow = await prisma.videoProcessing.findFirst({
      where: { id: videoId },
    });
    expect(processingRow).toBeNull();
  });

  it('honors an explicitly requested visibility change (publishing PRIVATE -> PUBLIC)', async () => {
    // Regression guard for a previously-fixed bug: video.service.ts:231-235
    // used to discard any truthy `visibility` argument
    // (`visbilityUpadate = undefined`) whenever the caller explicitly
    // requested one. Since the GraphQL schema declares `visibility:
    // String!` (non-null), real client calls always pass a truthy string,
    // so that bug meant a video could never actually be published. Fixed
    // to: `video.videoStatus === VideoStatus.PROCESSING ? DRAFT :
    // (visibility ?? video.visibility)` — an explicit request now applies
    // unless the video is still PROCESSING (see the DRAFT-lock test
    // above, which still exercises that override path).
    const ownerId = await seedUser();
    const videoId = await seedVideo(ownerId, {
      videoStatus: VideoStatus.AVAILABLE,
      visibility: VideoVisibility.PRIVATE,
    });
    const token = signUserToken(ownerId);

    const response = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: UPDATE_VIDEO_MUTATION,
        variables: {
          videoId,
          title: 'Publishing my video',
          tags: null,
          description: null,
          visibility: 'PUBLIC',
        },
      })
      .expect(200);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.updateVideo.visibility).toBe('PUBLIC');

    const persisted = await prisma.video.findUnique({ where: { id: videoId } });
    expect(persisted?.visibility).toBe(VideoVisibility.PUBLIC);
  });
});
