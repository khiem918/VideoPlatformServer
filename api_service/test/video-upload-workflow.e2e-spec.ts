/**
 * E2E tests for the full "upload a video, init and update its metadata"
 * workflow, end to end, against a real ~170MB 4K video file on disk. This is
 * the single, complete-flow suite for the init-and-update-metadata feature:
 * input data all the way through finished processing, with no mocking of
 * Postgres/Redis/RabbitMQ/S3/ffmpeg -- every assertion below is against
 * actual results the real pipeline produced.
 *
 * Scope:
 *   Step 1: GraphQL `initUploadVideo` (src/video/video.resolver.ts) ->
 *   VideoService.initUpload -> S3Service.getPresignedUploadUrl -> a real
 *   HTTP PUT of the real file to the live S3/R2 bucket configured in
 *   api_service/.env.
 *
 *   Step 2: GraphQL `updateVideo` (pre-processing, before transcoding
 *   starts) -> VideoService.updateVideo -> PublisherService.transferVideoMetadata
 *   -> RabbitMQ exchange `video.processing`, routing key
 *   `video.metadata.trans`.
 *
 *   Step 3: GraphQL `completeUploadVideo` -> VideoService.completeUpload ->
 *   VideoProcessingQueueService enqueues a real BullMQ job on the
 *   `video-processing` queue, which the live `VideoProcessingHandler`
 *   (src/video-processing/video-processing.handler.ts, wired into this same
 *   AppModule) picks up and runs REAL ffmpeg transcoding + thumbnail
 *   extraction against the real uploaded file, re-uploading DASH segments
 *   and a thumbnail back to the same bucket.
 *
 *   Step 4: GraphQL `updateVideo` again (post-processing, after transcoding
 *   finishes) -> the same RabbitMQ wire contract a second time. This suite
 *   pins the exact wire-contract payload api_service puts on that exchange
 *   at both updates (`{ correlationId, videoId, title, description,
 *   hashtags }`).
 *
 *   Step 5: this suite is the single entry point for the whole feature --
 *   after its own GraphQL/Postgres/RabbitMQ assertions above, it spawns
 *   `pytest` on search_service/tests/e2e/test_video_upload_workflow_e2e.py
 *   (which replays the same two pinned payloads against the real consumer
 *   and real Qdrant, in the same order, asserting the second message
 *   upserts the same Qdrant point rather than creating a duplicate) and
 *   fails this test if that pytest run doesn't pass. One command --
 *   `npm run test:e2e -- video-upload-workflow.e2e-spec.ts` -- exercises
 *   and verifies both services.
 *
 * PREREQUISITES (live infrastructure required, no mocking of
 * Postgres/Redis/RabbitMQ/S3):
 *   1. Start Postgres + Redis + RabbitMQ + Qdrant: `docker/dev.sh start`
 *      (uses `docker/docker-compose.api-service.yml`).
 *   2. `api_service/.env` must point at those services (DATABASE_URL,
 *      REDIS_HOST/PORT, RABBITMQ_URI, JWT_SECRET) AND at a real, reachable
 *      S3-compatible bucket (S3_*, BUCKET_NAME) -- this suite performs a
 *      real upload/download/delete cycle against that bucket. Prisma
 *      migrations must be applied (`npx prisma migrate deploy`).
 *   3. The fixture video below must exist on disk locally; this suite is
 *      not meant to run in CI without it.
 *   4. search_service/venv must exist with its deps installed
 *      (`search_service/.env` pointing MQ_URL/QDRANT_URL at the same
 *      RabbitMQ/Qdrant) -- Step 5 above shells out to it.
 *   5. Run with: `npm run test:e2e -- video-upload-workflow.e2e-spec.ts`
 *      Real ffmpeg transcoding of a ~3 minute 4K clip can take several
 *      minutes; the suite raises Jest's timeout accordingly.
 *
 * Bug documented (observed, not fixed): `VideoInformation.metaStatus` is
 * never transitioned to PROCESSED anywhere in the codebase (see
 * VideoProcessingRepository.completeVideoProcessing, which reads back the
 * untouched pre-existing value instead of setting one). VideoProcessingService's
 * private `triggerVideoStatus()` only calls `repository.publicVideo()` (which
 * sets `Video.videoStatus = AVAILABLE`) when `videoStatus === PROCESSED &&
 * metaStatus === PROCESSED` -- a condition that can therefore never be true.
 * `Video.videoStatus` never reaches AVAILABLE even after real transcoding
 * finishes successfully, and the `VideoStatus.PROCESSING` DRAFT-lock branch
 * in VideoService.updateVideo (video.service.ts:222-225) is permanently
 * unreachable -- see the assertion after Step 3 below.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execFile } from 'child_process';
import { promisify } from 'util';
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
import { UploadVideoStatus, VideoVisibility } from '@prisma/client';

const VIDEO_FILE_PATH =
  '/home/khiem918/Documents/Project/VideoPlatformServer/3MinutesofOppenheimerin4K _IMAX_2160p.mp4';
const VIDEO_MIME_TYPE = 'video/mp4';

const EXCHANGE = 'video.processing';
const ROUTING_KEY = 'video.metadata.trans';
const MESSAGE_WAIT_TIMEOUT_MS = 5000;
const TRANSCODE_POLL_INTERVAL_MS = 3000;
const TRANSCODE_TIMEOUT_MS = 10 * 60 * 1000;

const SEARCH_SERVICE_DIR = path.join(__dirname, '../../search_service');
const SEARCH_SERVICE_PYTHON = path.join(SEARCH_SERVICE_DIR, 'venv/bin/python');
const PYTEST_TIMEOUT_MS = 60 * 1000;

const execFileAsync = promisify(execFile);

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

// Single entry point for the search_service side of this workflow: runs
// search_service's own pytest suite (which replays this suite's two pinned
// wire-contract payloads against the real consumer and real Qdrant) and
// fails this test if that run doesn't pass, instead of re-implementing its
// consumer/Qdrant assertions here.
async function runSearchServiceE2ePytest(): Promise<void> {
  try {
    await execFileAsync(
      SEARCH_SERVICE_PYTHON,
      ['-m', 'pytest', 'tests/e2e/test_video_upload_workflow_e2e.py', '-q'],
      { cwd: SEARCH_SERVICE_DIR, timeout: PYTEST_TIMEOUT_MS },
    );
  } catch (error: any) {
    throw new Error(
      'search_service pytest suite (test_video_upload_workflow_e2e.py) failed:\n' +
        `${error.stdout ?? ''}\n${error.stderr ?? error.message}`,
    );
  }
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

    // --- Step 2: pre-processing metadata update, before transcoding starts ---
    const preProcessingMessage = waitForMessage();

    const preTitle = 'Oppenheimer 4K IMAX clip (uploading)';
    const preDescription =
      'Description set immediately after upload, before transcoding starts.';
    const preTags = ['oppenheimer', 'imax', 'pre-processing'];

    const preUpdateResponse = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: UPDATE_VIDEO_MUTATION,
        variables: {
          videoId,
          title: preTitle,
          tags: preTags,
          description: preDescription,
          visibility: 'PUBLIC',
        },
      })
      .expect(200);

    expect(preUpdateResponse.body.errors).toBeUndefined();
    expect(preUpdateResponse.body.data.updateVideo).toMatchObject({
      id: videoId,
      videoName: preTitle,
      rawDesc: preDescription,
      // Honored immediately: Video.videoStatus is still null here (never
      // PROCESSING), so the DRAFT-lock branch in updateVideo never engages.
      visibility: 'PUBLIC',
      tags: preTags,
    });

    const preMessage = await preProcessingMessage;
    expect(preMessage).toEqual({
      correlationId: videoId,
      videoId,
      title: preTitle,
      description: preDescription,
      hashtags: preTags,
    });

    // --- Step 3: complete upload, letting the live BullMQ worker run real ffmpeg transcoding ---
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

    // Real transcoding doesn't clobber the metadata set in Step 2.
    expect(processedVideo?.videoName).toBe(preTitle);
    expect(processedVideo?.videoDesc).toBe(preDescription);
    expect(processedVideo?.visibility).toBe(VideoVisibility.PUBLIC);

    // Bug documented (observed, not fixed -- see module docstring):
    // processing finished successfully (videoStatus PROCESSED above), but
    // Video.videoStatus never becomes AVAILABLE because
    // VideoInformation.metaStatus is never transitioned to PROCESSED.
    expect(processedVideo?.videoStatus).toBeNull();

    // --- Step 4: post-processing metadata update, pinning the wire contract search_service consumes ---
    const postProcessingMessage = waitForMessage();

    const title = 'Oppenheimer 4K IMAX clip';
    const description =
      'A 3 minute 4K IMAX excerpt from Oppenheimer, used as the upload-workflow e2e fixture.';
    const tags = ['oppenheimer', 'imax', '4k'];

    const updateResponse = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: UPDATE_VIDEO_MUTATION,
        variables: { videoId, title, tags, description, visibility: 'PRIVATE' },
      })
      .expect(200);

    expect(updateResponse.body.errors).toBeUndefined();
    expect(updateResponse.body.data.updateVideo).toMatchObject({
      id: videoId,
      videoName: title,
      rawDesc: description,
      // Still honored immediately: per the assertion above,
      // Video.videoStatus never reached AVAILABLE either, so the
      // DRAFT-lock branch stays unreachable here too.
      visibility: 'PRIVATE',
      tags,
    });

    const message = await postProcessingMessage;
    expect(message).toEqual({
      correlationId: videoId,
      videoId,
      title,
      description,
      hashtags: tags,
    });

    const videoAfterSecondUpdate = await prisma.video.findUnique({
      where: { id: videoId },
    });
    expect(videoAfterSecondUpdate?.videoName).toBe(title);
    expect(videoAfterSecondUpdate?.visibility).toBe(VideoVisibility.PRIVATE);
    // The real transcoded asset survives a metadata-only update.
    expect(videoAfterSecondUpdate?.videoPath).toBe(processedVideo?.videoPath);

    // --- Step 5: verify the search_service side by running its own real suite ---
    await runSearchServiceE2ePytest();
  });
});
