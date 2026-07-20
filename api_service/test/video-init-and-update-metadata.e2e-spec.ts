/**
 * E2E tests for the "init upload + update video metadata" flow, covering the
 * complete lifecycle from input data (initUploadVideo) through finished
 * processing, focused entirely on the metadata side of the pipeline.
 *
 * Scope: GraphQL `initUploadVideo` (src/video/video.resolver.ts) ->
 * VideoService.initUpload -> GraphQL `updateVideo` (pre-processing) ->
 * VideoService.updateVideo -> PublisherService.transferVideoMetadata ->
 * RabbitMQ exchange `video.processing` (routing key `video.metadata.trans`)
 * -> GraphQL `completeUploadVideo` -> real BullMQ `video-processing` queue
 * -> VideoProcessingHandler -> VideoProcessingService.transcodeVideo ->
 * GraphQL `updateVideo` again (post-processing).
 *
 * Unlike api_service/test/video-upload-workflow.e2e-spec.ts (which proves
 * the real ffmpeg/S3 pipeline against a real ~170MB fixture file), this
 * suite is not about transcoding correctness: it mocks only the two
 * heavy-I/O collaborators -- S3Service's network calls and FFmpegService's
 * ffmpeg invocations -- so the real BullMQ job, real repository status
 * transitions, and real RabbitMQ publish all still run for real, just fast
 * and without a live bucket or a real video file. The goal is proving
 * metadata correctness (persistence + wire contract) across the whole
 * init -> pre-processing update -> processing -> post-processing update
 * lifecycle, all in one test.
 *
 * PREREQUISITES (live infrastructure required, no mocking of
 * Postgres/RabbitMQ):
 *   1. Start Postgres + RabbitMQ: `docker/dev.sh start` (uses
 *      `docker/docker-compose.api-service.yml`).
 *   2. `api_service/.env` must point at those services (DATABASE_URL,
 *      RABBITMQ_URI, JWT_SECRET) and Prisma migrations must be applied
 *      (`npx prisma migrate deploy`). S3 credentials only need to be
 *      present (any value) -- presigned-URL signing is a local computation
 *      and never reaches a real bucket in this suite.
 *   3. Run with: `npm run test:e2e -- video-init-and-update-metadata.e2e-spec.ts`
 *      No fixture video file needed; the whole suite runs in seconds since
 *      S3Service/FFmpegService's file-I/O methods are mocked (see beforeAll).
 *
 * Bug documented (observed, not fixed): `VideoInformation.metaStatus` is
 * never transitioned to PROCESSED anywhere in the codebase (see
 * VideoProcessingRepository.completeVideoProcessing, which reads back the
 * untouched pre-existing value instead of setting one). VideoProcessingService's
 * private `triggerVideoStatus()` only calls `repository.publicVideo()` (which
 * sets `Video.videoStatus = AVAILABLE`) when `videoStatus === PROCESSED &&
 * metaStatus === PROCESSED` -- a condition that can therefore never be true.
 * `Video.videoStatus` never reaches AVAILABLE, and the `VideoStatus.PROCESSING`
 * DRAFT-lock branch in VideoService.updateVideo (video.service.ts:222-225) is
 * permanently unreachable. This suite asserts that observed behavior rather
 * than the (currently unreachable) intended behavior.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
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
import { FFmpegService } from 'src/video-processing/ffmpeg.service';
import {
  UploadVideoStatus,
  VideoVisibility,
} from '@prisma/client';

const VIDEO_MIME_TYPE = 'video/mp4';

const EXCHANGE = 'video.processing';
const ROUTING_KEY = 'video.metadata.trans';
const MESSAGE_WAIT_TIMEOUT_MS = 5000;
const PROCESSING_POLL_INTERVAL_MS = 200;
const PROCESSING_TIMEOUT_MS = 20000;

jest.setTimeout(60 * 1000);

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

describe('Init and update video metadata (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let s3Service: S3Service;
  let ffmpegService: FFmpegService;
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
    s3Service = app.get(S3Service);
    ffmpegService = app.get(FFmpegService);

    amqpConnection = await amqp.connect(
      process.env.RABBITMQ_URI ?? 'amqp://guest:guest@localhost:5672',
    );

    // Mock only the heavy file-I/O collaborators (real network/ffmpeg calls
    // would need a live bucket + a real video file). Everything downstream --
    // the real BullMQ job, VideoProcessingRepository's status transitions,
    // and PublisherService's RabbitMQ publish -- still runs for real.
    jest.spyOn(s3Service, 'fileExists').mockResolvedValue(true);
    jest
      .spyOn(s3Service, 'getFileStream')
      .mockResolvedValue(Readable.from(Buffer.from('fake-video-bytes')));
    jest
      .spyOn(s3Service, 'uploadFileStream')
      .mockImplementation(async (_filePath: string, objectPath: string) => objectPath);
    jest.spyOn(ffmpegService, 'getVideoMetadata').mockResolvedValue({
      duration: 5,
      width: 1920,
      height: 1080,
      bitrate: '1000k',
    });
    jest
      .spyOn(ffmpegService, 'transcodeToDASH')
      .mockImplementation(async (_inputPath: string, outputDir: string) => {
        await fs.promises.mkdir(outputDir, { recursive: true });
        const manifest = path.join(outputDir, 'manifest.mpd');
        await fs.promises.writeFile(manifest, '<MPD></MPD>');
        return { manifest };
      });
    jest
      .spyOn(ffmpegService, 'extractThumbnail')
      .mockImplementation(async (_inputPath: string, outputPath: string) => {
        await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.promises.writeFile(outputPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      });
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

  async function pollUntilProcessed(videoId: string) {
    const deadline = Date.now() + PROCESSING_TIMEOUT_MS;

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
        setTimeout(resolve, PROCESSING_POLL_INTERVAL_MS),
      );
    }

    throw new Error(
      `Timed out after ${PROCESSING_TIMEOUT_MS}ms waiting for video ${videoId} to finish processing`,
    );
  }

  it('covers the whole init -> update -> processing -> update lifecycle, pinning the wire contract at each metadata change', async () => {
    // --- Step 1: input data ---
    const ownerId = await seedUser();
    const token = signUserToken(ownerId);
    const fileName = 'metadata-flow-fixture.mp4';
    const fileSize = 12345;

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
    expect(presignedUrl).toMatch(/^https?:\/\//);

    const infoAfterInit = await prisma.videoInformation.findUnique({
      where: { videoId },
    });
    expect(infoAfterInit?.videoStatus).toBe(UploadVideoStatus.PENDING);
    expect(infoAfterInit?.objectPath).toContain(videoId);

    const videoAfterInit = await prisma.video.findUnique({
      where: { id: videoId },
    });
    expect(videoAfterInit?.videoStatus).toBeNull();

    // --- Step 2: pre-processing metadata update ---
    const preProcessingMessage = waitForMessage();
    const preTitle = 'Draft title before processing';
    const preDescription = 'Description set before transcoding starts';
    const preTags = ['pre-processing'];

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

    // --- Step 3: complete upload -> real BullMQ job -> mocked-fast transcode ---
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

    const processedInfo = await pollUntilProcessed(videoId);
    expect(processedInfo?.videoStatus).toBe(UploadVideoStatus.PROCESSED);

    // --- Step 4: finished processing -- assets populated, prior metadata untouched ---
    const videoAfterProcessing = await prisma.video.findUnique({
      where: { id: videoId },
    });
    expect(videoAfterProcessing?.videoPath).toBeTruthy();
    expect(videoAfterProcessing?.thumbnailPath).toBeTruthy();
    expect(videoAfterProcessing?.duration).toBe(5);
    expect(videoAfterProcessing?.videoName).toBe(preTitle);
    expect(videoAfterProcessing?.videoDesc).toBe(preDescription);
    expect(videoAfterProcessing?.visibility).toBe(VideoVisibility.PUBLIC);

    // --- Step 5: documents the dead metaStatus -> AVAILABLE transition ---
    // (observed bug, not fixed -- see module docstring). Processing finished
    // successfully, but Video.videoStatus never becomes AVAILABLE because
    // VideoInformation.metaStatus is never transitioned to PROCESSED.
    expect(videoAfterProcessing?.videoStatus).toBeNull();

    // --- Step 6: post-processing metadata update ---
    const postProcessingMessage = waitForMessage();
    const postTitle = 'Final title after processing';
    const postDescription = 'Description set after transcoding finished';
    const postTags = ['post-processing', 'final'];

    const postUpdateResponse = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: UPDATE_VIDEO_MUTATION,
        variables: {
          videoId,
          title: postTitle,
          tags: postTags,
          description: postDescription,
          visibility: 'PRIVATE',
        },
      })
      .expect(200);

    expect(postUpdateResponse.body.errors).toBeUndefined();
    expect(postUpdateResponse.body.data.updateVideo).toMatchObject({
      id: videoId,
      videoName: postTitle,
      rawDesc: postDescription,
      // Still honored immediately: per step 5, Video.videoStatus never
      // reached AVAILABLE either, so the DRAFT-lock branch stays unreachable.
      visibility: 'PRIVATE',
      tags: postTags,
    });

    const postMessage = await postProcessingMessage;
    expect(postMessage).toEqual({
      correlationId: videoId,
      videoId,
      title: postTitle,
      description: postDescription,
      hashtags: postTags,
    });

    const videoAfterSecondUpdate = await prisma.video.findUnique({
      where: { id: videoId },
    });
    expect(videoAfterSecondUpdate?.videoName).toBe(postTitle);
    expect(videoAfterSecondUpdate?.visibility).toBe(VideoVisibility.PRIVATE);
    // Processing assets survive a metadata-only update.
    expect(videoAfterSecondUpdate?.videoPath).toBe(videoAfterProcessing?.videoPath);
  });
});
