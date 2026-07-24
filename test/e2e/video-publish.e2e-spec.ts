/**
 * Test 1 -- video publish pipeline, black-box against the staging stack
 * (docker/docker-compose.staging.yml, or a real deployed staging via
 * STAGING_* env vars -- see support/env.ts).
 *
 * Flow exercised end to end, no mocking (see support/publish-video.ts):
 *   GraphQL initUploadVideo -> real PUT to the presigned R2/S3 URL ->
 *   GraphQL completeUploadVideo -> real BullMQ/ffmpeg transcode -> poll
 *   api_service Postgres (core.video_upload.video_status) for completion ->
 *   GraphQL updateVideo -> RabbitMQ (video.processing / video.metadata.trans)
 *   -> search_service consumes, embeds (fastembed), upserts into Qdrant,
 *   acks on video.metadata.res -> api_service's ConsumerService flips
 *   core.video_upload.meta_status to PROCESSED.
 *
 * Success is asserted purely through externally observable state (Postgres
 * rows, Qdrant point), never by reading either service's internals.
 */
import { Pool } from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import { createApiPool, createGraphQlClient, createQdrantClient } from './support/clients';
import { seedUser, signUserToken, cleanupUser, cleanupVideo } from './support/seed';
import { publishTestVideo } from './support/publish-video';

jest.setTimeout(3 * 60 * 1000);

describe('Video publish pipeline (e2e)', () => {
  let pool: Pool;
  let qdrant: QdrantClient;
  const seededUserIds: string[] = [];
  const seededVideoIds: string[] = [];

  beforeAll(() => {
    pool = createApiPool();
    qdrant = createQdrantClient();
  });

  afterAll(async () => {
    for (const videoId of seededVideoIds) {
      await cleanupVideo(pool, videoId);
    }
    for (const userId of seededUserIds) {
      await cleanupUser(pool, userId);
    }
    await pool.end();
  });

  it('uploads a video, completes processing, and lands correct metadata in api_service Postgres and search_service Qdrant', async () => {
    const ownerId = await seedUser(pool);
    seededUserIds.push(ownerId);
    const client = createGraphQlClient(signUserToken(ownerId));

    // No special characters in the title: search_service's standard_normalize
    // (src/domain/service/normalize.py) lowercases and strips punctuation, so
    // an already-plain-ASCII title survives normalization unchanged and can
    // be compared directly below.
    const { videoId } = await publishTestVideo(client, pool, {
      title: 'e2e fixture video sample',
      description: 'synthetic tiny video used by the video publish e2e suite',
    });
    seededVideoIds.push(videoId);

    // core.video_upload.video_status === PROCESSED and meta_status ===
    // PROCESSED are already asserted inside publishTestVideo (it polls both
    // to completion and throws on timeout) -- this suite's own assertion is
    // the independent, external-to-both-services proof that search_service
    // actually persisted the upsert, not merely acked it.
    const points = await qdrant.retrieve('videos', { ids: [videoId], with_payload: true });
    expect(points).toHaveLength(1);
    expect(points[0]?.payload?.title).toBe('e2e fixture video sample');
  });
});
