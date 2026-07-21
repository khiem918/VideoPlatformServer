import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { Pool } from 'pg';
import { GraphQLClient } from 'graphql-request';

const FIXTURE_PATH = path.join(__dirname, 'fixtures/demo-video.webm');
const MIME_TYPE = 'video/webm';
const TRANSCODE_POLL_INTERVAL_MS = 2_000;
const TRANSCODE_TIMEOUT_MS = 2 * 60 * 1000;
const META_POLL_INTERVAL_MS = 1_000;
const META_TIMEOUT_MS = 30 * 1000;

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
    }
  }
`;

function putFileToPresignedUrl(presignedUrl: string, filePath: string, contentType: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const { size } = fs.statSync(filePath);
    const target = new URL(presignedUrl);
    const client = target.protocol === 'https:' ? https : http;

    const req = client.request(
      target,
      { method: 'PUT', headers: { 'Content-Type': contentType, 'Content-Length': size } },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );

    req.on('error', reject);
    fs.createReadStream(filePath).pipe(req);
  });
}

export async function pollUntil<T>(
  fn: () => Promise<T | null>,
  { timeoutMs, intervalMs }: { timeoutMs: number; intervalMs: number },
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await fn();
    if (result !== null) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`pollUntil: condition not met within ${timeoutMs}ms`);
}

export interface PublishedVideo {
  videoId: string;
  title: string;
  description: string;
}

/**
 * Drives the real upload -> transcode -> metadata-update pipeline to
 * completion (poll api_service Postgres for both video_status and
 * meta_status), used as setup by any suite that needs a video already
 * indexed in search_service's Qdrant collection.
 */
export async function publishTestVideo(
  client: GraphQLClient,
  pool: Pool,
  { title, description }: { title: string; description: string },
): Promise<PublishedVideo> {
  const fileName = path.basename(FIXTURE_PATH);
  const { size: fileSize } = fs.statSync(FIXTURE_PATH);

  const initResult = await client.request<{
    initUploadVideo: { videoId: string; presignedUrl: string };
  }>(INIT_UPLOAD_MUTATION, { fileName, fileSize, mimeType: MIME_TYPE });

  const { videoId, presignedUrl } = initResult.initUploadVideo;

  const putStatus = await putFileToPresignedUrl(presignedUrl, FIXTURE_PATH, MIME_TYPE);
  if (putStatus !== 200) {
    throw new Error(`Presigned upload PUT failed with status ${putStatus}`);
  }

  await client.request(COMPLETE_UPLOAD_MUTATION, { uploadId: videoId });

  await pollUntil(async () => {
    const { rows } = await pool.query<{ video_status: string }>(
      'SELECT video_status FROM core.video_upload WHERE video_id = $1',
      [videoId],
    );
    return rows[0]?.video_status === 'PROCESSED' ? true : null;
  }, { timeoutMs: TRANSCODE_TIMEOUT_MS, intervalMs: TRANSCODE_POLL_INTERVAL_MS });

  await client.request(UPDATE_VIDEO_MUTATION, {
    videoId,
    title,
    tags: ['e2e', 'fixture'],
    description,
    visibility: 'PUBLIC',
  });

  await pollUntil(async () => {
    const { rows } = await pool.query<{ meta_status: string }>(
      'SELECT meta_status FROM core.video_upload WHERE video_id = $1',
      [videoId],
    );
    return rows[0]?.meta_status === 'PROCESSED' ? true : null;
  }, { timeoutMs: META_TIMEOUT_MS, intervalMs: META_POLL_INTERVAL_MS });

  return { videoId, title, description };
}
