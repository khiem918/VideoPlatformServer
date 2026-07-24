/**
 * Test 2 -- search pipeline, black-box against the staging stack.
 *
 * Covers the two things this suite is asked to prove about
 * search_service's SearchService (src/domain/service/search.py):
 *
 *   1. Redis caching is correct: the first (cursor-less) call runs the real
 *      embed + Qdrant search and schedules a cache write; this suite reads
 *      the `search:{userId}:{queryId}` zset and `meta:{videoId}` keys
 *      directly out of Redis to prove that write actually happened, then
 *      makes a cursor-paginated call (the only branch that reads the cache)
 *      and asserts it returns the same, correct video.
 *
 *   2. api_service metadata retrieval works correctly: deleting the cached
 *      `meta:{videoId}` key and re-requesting forces `_handle_metadata`
 *      (search.py) down its gRPC-fetch-from-api_service branch; this suite
 *      asserts the refetched title is still correct and that the key is
 *      re-cached afterward -- proving the api_service gRPC metadata path
 *      itself (not just the cache) returns correct data.
 */
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { createApiPool, createGraphQlClient, createSearchRedis } from './support/clients';
import { seedUser, signUserToken, cleanupUser, cleanupVideo } from './support/seed';
import { publishTestVideo, pollUntil } from './support/publish-video';
import { SEARCH_ENDPOINT } from './support/env';

jest.setTimeout(3 * 60 * 1000);

interface SearchResponse {
  video_id: string;
  title: string;
  description: string;
}

interface SearchResponseList {
  data: SearchResponse[];
  cursor: number | null;
}

function searchCacheKey(userId: string, queryId: string): string {
  return `search:${userId}:${queryId}`;
}

function metaCacheKey(videoId: string): string {
  return `meta:${videoId}`;
}

async function callSearch(
  token: string,
  query: string,
  cursor?: number,
): Promise<SearchResponseList> {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set('query', query);
  url.searchParams.set('limit', '10');
  if (cursor !== undefined) {
    url.searchParams.set('cursor', String(cursor));
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`search request failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as SearchResponseList;
}

describe('Search pipeline (e2e)', () => {
  let pool: Pool;
  let redis: Redis;
  const seededUserIds: string[] = [];
  const seededVideoIds: string[] = [];

  beforeAll(async () => {
    pool = createApiPool();
    redis = createSearchRedis();
    await redis.connect();
  });

  afterAll(async () => {
    for (const videoId of seededVideoIds) {
      await cleanupVideo(pool, videoId);
    }
    for (const userId of seededUserIds) {
      await cleanupUser(pool, userId);
    }
    await pool.end();
    redis.disconnect();
  });

  it('caches search results and metadata in Redis, and correctly re-fetches metadata from api_service on a cache miss', async () => {
    const ownerId = await seedUser(pool);
    seededUserIds.push(ownerId);
    const client = createGraphQlClient(signUserToken(ownerId));

    // Single lowercase alnum token, no spaces/punctuation, so
    // normalize_query_to_id (search_service/src/domain/service/normalize.py)
    // maps it to itself -- no need to reimplement that normalization here.
    const query = `e2esearchcacheprobe${randomUUID().replace(/-/g, '')}`;

    const { videoId, title } = await publishTestVideo(client, pool, {
      title: query,
      description: 'video used by the search cache e2e suite',
    });
    seededVideoIds.push(videoId);

    const token = signUserToken(ownerId);

    // --- Step 1: cursor-less call runs the real search + schedules the
    // cache write (fire-and-forget asyncio.create_task in search.py) ---
    const firstResult = await callSearch(token, query);
    expect(firstResult.data.map((item) => item.video_id)).toContain(videoId);

    const cacheKey = searchCacheKey(ownerId, query);

    await pollUntil(async () => {
      const exists = await redis.exists(cacheKey);
      return exists === 1 ? true : null;
    }, { timeoutMs: 10_000, intervalMs: 500 });

    const cachedMembers = await redis.zrange(cacheKey, 0, -1);
    expect(cachedMembers).toContain(videoId);
    await expect(redis.ttl(cacheKey)).resolves.toBeGreaterThan(0);
    await expect(redis.exists(metaCacheKey(videoId))).resolves.toBe(1);

    // --- Step 2: cursor-paginated call is the only branch that reads the
    // cache instead of re-running embed + Qdrant search ---
    const cachedResult = await callSearch(token, query, 0);
    const cachedEntry = cachedResult.data.find((item) => item.video_id === videoId);
    expect(cachedEntry?.title).toBe(title);

    // --- Step 3: force a metadata cache miss and confirm the api_service
    // gRPC re-fetch path returns correct, up-to-date data ---
    await redis.del(metaCacheKey(videoId));
    await expect(redis.exists(metaCacheKey(videoId))).resolves.toBe(0);

    const afterMetaMiss = await callSearch(token, query, 0);
    const refetchedEntry = afterMetaMiss.data.find((item) => item.video_id === videoId);
    expect(refetchedEntry?.title).toBe(title);

    // _handle_metadata re-caches whatever it fetched over gRPC.
    await pollUntil(async () => {
      const exists = await redis.exists(metaCacheKey(videoId));
      return exists === 1 ? true : null;
    }, { timeoutMs: 10_000, intervalMs: 500 });
  });
});
