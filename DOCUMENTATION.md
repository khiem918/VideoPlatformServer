# Video Platform Server — Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Repository Structure](#3-repository-structure)
4. [Data Models (Database Schema)](#4-data-models-database-schema)
5. [NestJS Backend Server](#5-nestjs-backend-server)
   - 5.1 [Entry Point & Bootstrap](#51-entry-point--bootstrap)
   - 5.2 [Authentication Module](#52-authentication-module)
   - 5.3 [Video Module](#53-video-module)
   - 5.4 [Video Processing Module](#54-video-processing-module)
   - 5.5 [Embed Module](#55-embed-module)
   - 5.6 [Search Module](#56-search-module)
   - 5.7 [Notification Module](#57-notification-module)
   - 5.8 [Semantic Processing Module](#58-semantic-processing-module)
   - 5.9 [Tag Module](#59-tag-module)
   - 5.10 [S3 / Cloudflare R2 Service](#510-s3--cloudflare-r2-service)
   - 5.11 [Qdrant Service](#511-qdrant-service)
   - 5.12 [Queue Module](#512-queue-module)
   - 5.13 [Prisma Module](#513-prisma-module)
6. [GraphQL API Reference](#6-graphql-api-reference)
7. [Python AI Server (Embed\_Server)](#7-python-ai-server-embed_server)
8. [Cloudflare R2 Worker](#8-cloudflare-r2-worker)
9. [Infrastructure](#9-infrastructure)
10. [Key Flows (End-to-End)](#11-key-flows-end-to-end)
    - 10.1 [User Sign-In Flow](#111-user-sign-in-flow)
    - 10.2 [Video Upload Flow](#112-video-upload-flow)
    - 10.3 [Video Processing Flow](#113-video-processing-flow)
    - 10.4 [Semantic Indexing Flow](#114-semantic-indexing-flow)
    - 10.5 [Hybrid Search Flow](#115-hybrid-search-flow)
    - 10.6 [Video Playback Flow](#116-video-playback-flow)
    - 10.7 [Notification Flow](#117-notification-flow)

---

## 1. Project Overview

This is a full-stack video platform backend, similar in concept to YouTube. It handles:

- **User authentication** via Google OAuth 2.0 with JWT + refresh-token session management
- **Video upload** via Cloudflare R2 pre-signed URLs (client uploads directly to R2)
- **Video processing** — FFmpeg-based transcoding to MPEG-DASH adaptive bitrate format with thumbnail extraction
- **AI-powered semantic search** — videos are indexed as dense vectors using `multilingual-e5-base` and searched with a hybrid keyword + vector strategy
- **Real-time notifications** via GraphQL subscriptions backed by Redis Streams
- **Engagement** — likes, dislikes, comments, subscriptions, watch history

**Tech stack:**

| Layer | Technology |
|---|---|
| API server | NestJS 11 (TypeScript) + Apollo GraphQL |
| Database | PostgreSQL 16 via Prisma ORM |
| Cache / Queue broker | Redis 7 (ioredis, BullMQ) |
| Vector DB | Qdrant 1.13.6 |
| Video storage | Cloudflare R2 (S3-compatible) |
| Video CDN | Cloudflare Worker (r2-worker) |
| Video transcoding | FFmpeg (fluent-ffmpeg + ffmpeg-static) |
| AI service | FastAPI (Python) — sentence-transformers + BART |

---

## 2. Architecture

```
                        ┌─────────────────────────────────┐
                        │          Client (Browser)        │
                        └──────────────┬──────────────────┘
                                       │  GraphQL over HTTPS
                                       ▼
                        ┌─────────────────────────────────┐
                        │    NestJS API Server (main.ts)   │
                        │  ┌───────────┐  ┌────────────┐  │
                        │  │  Apollo   │  │  REST ctrl │  │
                        │  │ GraphQL   │  │(notification)│  │
                        │  └─────┬─────┘  └─────┬──────┘  │
                        │        │               │          │
                        │  ┌─────▼───────────────▼──────┐  │
                        │  │     NestJS Modules           │  │
                        │  │  Auth │ Video │ Search │ ... │  │
                        │  └──┬───┴──┬────┴────┬────┴──  │  │
                        │     │      │         │          │
                        │  ┌──▼──┐ ┌─▼──┐  ┌──▼──┐       │
                        │  │Redis│ │PG  │  │Qdrant│       │
                        │  └─────┘ └────┘  └──────┘       │
                        │                                  │
                        │  ┌────────────────────────────┐  │
                        │  │    BullMQ Workers           │  │
                        │  │  video-processing  │  embed │  │
                        │  └────────┬───────────┴───┬────┘  │
                        └───────────┼───────────────┼───────┘
                                    │               │
                     ┌──────────────▼──┐    ┌───────▼──────────┐
                     │  Cloudflare R2  │    │ Python AI Server  │
                     │  (video storage)│    │  (Embed_Server)   │
                     └──────────────┬──┘    └──────────────────┘
                                    │
                     ┌──────────────▼──────────────┐
                     │  Cloudflare Worker (r2-worker)│
                     │  (signed-URL streaming CDN)  │
                     └──────────────────────────────┘
```

**Data-flow summary:**
1. Client authenticates with Google; server issues JWT + refresh-token cookie.
2. Client requests a pre-signed upload URL → uploads video directly to R2.
3. Client calls `completeUploadVideo` → server queues a BullMQ `transcode-video` job.
4. Worker downloads the raw file, runs FFmpeg DASH transcoding, uploads artifacts to R2, updates DB.
5. When metadata is updated, another BullMQ `process-embed` job calls the Python AI server to generate 768-dim vectors, which are upserted into Qdrant.
6. Search queries run keyword search (PostgreSQL full-text) and vector search (Qdrant) in parallel; results are fused and ranked.
7. Playback requests receive a signed URL to the MPEG-DASH manifest served via the Cloudflare Worker.
8. Channel notifications are published to a Redis Stream; a consumer dispatches them via in-memory RxJS subjects to connected GraphQL subscriptions.

---

## 3. Repository Structure

```
VideoPlatformServer/
├── Server/                     # NestJS backend
│   ├── src/
│   │   ├── main.ts             # Bootstrap (HTTPS, CORS, cookie parser)
│   │   ├── app.module.ts       # Root module
│   │   ├── schema.gql          # Auto-generated GraphQL schema
│   │   ├── auth/               # Google OAuth + JWT auth
│   │   ├── video/              # Video CRUD, comments, likes, subscriptions
│   │   ├── video-processing/   # BullMQ consumer + FFmpeg pipeline
│   │   ├── embed/              # BullMQ consumer + vector indexing
│   │   ├── search/             # Hybrid keyword + vector search
│   │   ├── notification/       # Redis Streams + RxJS real-time notifications
│   │   ├── semantic-processing/# Text normalization + summarization
│   │   ├── tag/                # Hashtag management
│   │   ├── qdrant/             # Qdrant client wrapper
│   │   ├── s3/                 # Cloudflare R2 (S3-compatible) client
│   │   ├── queue/              # BullMQ queue module
│   │   ├── prisma/             # Prisma service
│   │   └── config/             # Env validation (class-validator)
│   ├── prisma/
│   │   ├── schema.prisma       # Full DB schema
│   │   └── seed.ts             # Seed script
│   └── package.json
│
├── Embed_Server/               # Python FastAPI AI service
│   └── app/
│       ├── main.py             # FastAPI app with /vector/generate + /desc/summarize
│       ├── schemas.py          # Pydantic models
│       └── service/
│           ├── embedding_model.py       # multilingual-e5-base via sentence-transformers
│           └── summarization_model.py  # facebook/bart-large-cnn via HuggingFace
│
├── r2-worker/                  # Cloudflare Worker — video CDN
│   └── src/index.js            # HMAC-validated R2 streaming with range-request support
│
├── Infra/
│   ├── Postgres/docker-compose.yml   # PostgreSQL 16 on port 5434
│   ├── Redis/docker-compose.yml      # Redis 7 on port 6379
│   └── Qdrant/docker-compose.yml     # Qdrant v1.13.6 on ports 6333/6334
│
└── script/
    └── dev.sh                  # Dev startup helper
```

---

## 4. Data Models (Database Schema)

All tables live in the `core` PostgreSQL schema. The Prisma schema is in [Server/prisma/schema.prisma](Server/prisma/schema.prisma).

### User

| Column | Type | Notes |
|---|---|---|
| `id` | String (PK) | User ID from Google OAuth |
| `user_name` | VarChar(30) | Display name, nullable |
| `user_password` | VarChar(100) | Stored hash (not used with Google SSO) |
| `user_email` | VarChar(320) | Unique |
| `channel_intro` | VarChar(1000) | Bio, nullable |
| `subscribe_count` | Int | Denormalised subscriber counter |

Indexes: `user_name`.

Relations: `videos`, `subscriptions`, `channels`, `watchHistory`, `videoUploads`, `comments`, `likeVideos`, `channelNotification`, `systemNotification`.

---

### Video

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid, PK) | Public video ID |
| `video_name` | VarChar(1000) | Default `"draft"` |
| `video_released_date` | Timestamp? | When published |
| `video_view` | Int | Denormalised view count |
| `video_like` / `video_dislike` | Int | Denormalised engagement |
| `user_owner` | String (FK → User) | Owner |
| `video_url_storage` | VarChar(1000)? | R2 path to `manifest.mpd` |
| `thumbnail_url` | String? | R2 path to thumbnail JPEG |
| `upload_id` | String (unique FK → VideoUpload) | |
| `video_visibility` | Enum | `DRAFT` / `PUBLISHED` / `PRIVATE` |
| `duration` | Int | Seconds |
| `videoDesc` | Text? | AI-summarised description shown to viewers |
| `rawDesc` | Text? | Original description from uploader |

Indexes: `user_owner`, `visibility`, `createdAt`, `(visibility, createdAt)`, `(visibility, videoView)`, `videoReleasedDate`.

---

### VideoUpload

Tracks the upload lifecycle from the moment a pre-signed URL is generated.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid, PK) | |
| `user_id` | FK → User | |
| `file_name` | String | Original filename |
| `mime_type` | String | e.g. `video/mp4` |
| `file_size` | BigInt | Bytes |
| `r2_path` | String (unique) | Path in R2 bucket |
| `status` | UploadStatus | `PENDING → UPLOADED → PROCESSING → COMPLETED / FAILED` |
| `fail_in` | VideoFail? | `Vectorlize` or `Process` |
| `processing_job_id` | String? | BullMQ job ID reference |

---

### VideoProcessing

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid, PK) | |
| `video_upload_id` | unique FK → VideoUpload | |
| `status` | ProcessingStatus | `PENDING → TRANSCODING → THUMBNAIL → HLS_GENERATION → COMPLETED / FAILED` |
| `hls_playlist_path` | String? | R2 path to manifest |
| `thumbnail_path` | String? | R2 path to thumbnail |
| `error_message` | String? | On failure |
| `started_at` / `completed_at` | DateTime? | Timing |

---

### Hashtag & VideoHashtag

`Hashtag` stores normalized tags with a usage counter. `VideoHashtag` is the M2M join table that also holds the display-form tag (original casing).

---

### Subscribe

Composite PK `(user_id, channel_id)`. Stores whether a subscriber wants push notifications (`notify_subscribe` boolean).

---

### WatchHistory

Composite PK `(user_id, video_id)`. Stores `paused_at` (seconds) and `watched_at` timestamp. Used for resume-playback.

---

### Comment

| Column | Notes |
|---|---|
| `id` (BigInt PK) | Set to `Date.now()` — effectively a time-ordered ID |
| `parent_id` | `null` for top-level; non-null for replies |
| `content` | Text |
| `like_count` / `reply_count` | Denormalised |
| `status` | Soft-moderation flag (0 = visible) |

Index: `(video_id, parent_id, created_at DESC)`.

---

### LikeVideo

Composite PK `(user_id, video_id)`. `is_like = true` means like; `false` means dislike. Toggle logic in `VideoRepository.likeOrDislikeVideo`.

---

### ChannelNotification & SystemNotification

Separate tables for channel-originated vs system-originated notifications. Both share fields: `content`, `notification_subject`, `is_read`, `created_at`.

---

### Enums

| Enum | Values |
|---|---|
| `UploadStatus` | `PENDING`, `UPLOADED`, `PROCESSING`, `COMPLETED`, `FAILED` |
| `ProcessingStatus` | `PENDING`, `TRANSCODING`, `THUMBNAIL`, `HLS_GENERATION`, `COMPLETED`, `FAILED` |
| `VideoVisibility` | `DRAFT`, `PUBLISHED`, `PRIVATE` |
| `VideoFail` | `Vectorlize`, `Process` |
| `Resolution` | `x144p`, `x360p`, `x480p`, `x720p`, `x1080p`, `x1440p`, `x2160p` |

---

## 5. NestJS Backend Server

### 5.1 Entry Point & Bootstrap

**File:** [Server/src/main.ts](Server/src/main.ts)

- Reads `SSL_KEY_PATH` / `SSL_CERT_PATH` from env; if both exist, creates an HTTPS server; otherwise HTTP.
- Enables signed cookie parsing (`COOKIE_SECRET`).
- Configures CORS for `CLIENT_URL` (defaults to `http://localhost:5173`).
- Listens on `SERVER_PORT`.

---

### 5.2 Authentication Module

**Files:** [Server/src/auth/](Server/src/auth/)

#### Strategy

Google OAuth 2.0 is used for identity. The server never stores a plain password for Google-authenticated users. JWT is used for short-lived API access; refresh tokens are stored as bcrypt hashes in Redis sessions.

#### Session Model

```
Redis key:  s:<sessionId>
Redis value (JSON):
{
  userId:       string,
  refreshToken: string (bcrypt hash of the raw token),
  createdAt:    ISO string
}
TTL: REFRESH_TOKEN_EXPIRES_IN (milliseconds)
```

Two HttpOnly signed cookies are set on the client:
- `SSID` — session UUID
- `FTK` — raw refresh token (128-hex-byte random)

#### GraphQL Mutations / Queries

| Operation | Guard | Description |
|---|---|---|
| `signIn(ClientToken)` | none | Verifies Google ID token, looks up or creates user by email, creates Redis session, returns JWT access token. |
| `rotateToken` | GqlAuthGuard | Validates current JWT + refresh token, issues new access token. If session is missing, creates a new session (refresh token reissuance). |
| `refresh` | none | Cookie-only refresh — rotates tokens from `FTK`/`SSID` cookies without requiring an Authorization header. Useful for page load. |
| `signOut` | GqlAuthGuard | Deletes Redis session, clears cookies. |
| `me` | GqlAuthGuard | Returns userId from JWT. |

#### JWT Strategy

[Server/src/auth/strategy/jwt.strategy.ts](Server/src/auth/strategy/jwt.strategy.ts) uses `passport-jwt` to extract the Bearer token from the `Authorization` header. On validation it returns `{ userId }` which is attached to the GraphQL context.

---

### 5.3 Video Module

**Files:** [Server/src/video/](Server/src/video/)

The `VideoService` is the largest service. It coordinates uploads, metadata, search indexing, notifications, and engagement.

#### `initUpload(userId, fileName, mimeType, fileSize)`

1. Validates mime type (mp4, webm, avi, quicktime) and file size (max 10 GB).
2. Generates a UUID video ID and a UUID upload ID.
3. Calls `S3Service.getPresignedUploadUrl` to get a 30-minute PUT pre-signed URL.
4. Creates `VideoUpload` (status=PENDING) and `Video` (visibility=DRAFT) records in a single DB transaction.
5. Returns `{ videoId, uploadId, presignedUrl, r2Path }` to the client.

#### `completeUpload(userId, uploadId)`

1. Finds the upload record; verifies ownership and that status is PENDING.
2. Calls `S3Service.fileExists` to confirm the file landed in R2.
3. Updates upload status to UPLOADED and creates a `VideoProcessing` record (status=PENDING) — in parallel.
4. Enqueues a `transcode-video` BullMQ job.

#### `updateVideo(userId, videoId, title, tags, description, visibility, isFirstPublish)`

1. Verifies video ownership.
2. Runs description through `SemanticProcessingService.processingDescription` (strip URLs, special chars) and then summarization (via Python AI server) if > 50 chars.
3. Enqueues a `process-embed` BullMQ job with normalized title + summarized description.
4. Handles tags via `TagService`.
5. Forces `DRAFT` visibility if processing is not COMPLETED.
6. Updates the Video record.
7. On `isFirstPublish`, sends a channel notification to all subscribers.

#### `getWatchVideoMetadata(videoId, userId)`

Returns full video metadata for the player page. Respects visibility:
- Private videos → 403 for non-owners.
- Draft videos → 403 for non-owners.
- Increments view count and upserts WatchHistory asynchronously (does not block response).

#### `getWatchVideoUrl(userId, videoId)`

Returns a signed URL to the MPEG-DASH manifest via the Cloudflare Worker:
- Computes HMAC signature: `HMAC-SHA256(R2_SIGN_SECRET, "${WORKER_KEY}:${expiresAt}")`.
- The R2 Worker validates this signature on every request.

#### Other VideoService Methods

| Method | Description |
|---|---|
| `deleteVideo` | Deletes R2 directory, Qdrant vector, and DB record in parallel. |
| `getUserVideos` | Returns all videos for a user with presigned thumbnail URLs. |
| `getVideoComments` | Cursor-based pagination (createdAt + id composite cursor) returning top-level comments. |
| `commentOnVideo` | Creates a comment with ID = `Date.now()` (BigInt). |
| `likeOrDislikeVideo` | Toggle like/dislike; handles switching from like→dislike or dislike→like atomically. |
| `subscribeChannel` | Prevents self-subscription. Increments/decrements channel `subscribeCount`. |
| `trackVideoWatchProgress` | Upserts WatchHistory with current pause position. |

---

### 5.4 Video Processing Module

**Files:** [Server/src/video-processing/](Server/src/video-processing/)

#### BullMQ Queue: `video-processing`

Job name: `transcode-video`

**Handler:** `VideoProcessingHandler` (extends `WorkerHost`) dispatches to `VideoProcessingService.transcodeVideo`.

#### `VideoProcessingService.transcodeVideo(data)`

Full pipeline:
1. Validates MIME type and required fields.
2. Updates `VideoProcessing` status → TRANSCODING.
3. Downloads raw video from R2 into `/tmp/video-processing/<uploadId>/` using Node.js `stream/pipeline`.
4. Calls `FFmpegService.getVideoMetadata` via ffprobe.
5. Calls `FFmpegService.transcodeToDASH`:
   - Selects quality variants dynamically based on original resolution: 144p, 360p, 720p, 1080p, 1440p, 2160p. Only qualities ≤ original are included.
   - Uses `libx264 + aac` codec.
   - Produces MPEG-DASH with 6-second segments, GOP of 48 frames.
   - Outputs `manifest.mpd` + `*.m4s` segment files.
6. Calls `FFmpegService.extractThumbnail` at t=3s, scaled to 320px wide JPEG.
7. Writes `meta.json` summary.
8. Uploads all artifacts to R2 under a sharded path: `videos/<shard>/<videoId>/`.
   - Shard is computed as `md5(videoId)[0:2] + "/" + md5(videoId)[2:4]` — 256 × 256 = 65,536 buckets.
9. Calls `VideoProcessingRepository.finalizeProcessingAndUpdateVideo`:
   - Updates `VideoProcessing` status → COMPLETED, stores manifest + thumbnail R2 paths.
   - Updates `Video.videoUrl` and `Video.thumbnailUrl`.
   - Updates `VideoUpload.status` → COMPLETED.
10. Cleans up `/tmp/video-processing/<uploadId>/`.

On failure, calls `VideoProcessingRepository.recordFailure` and re-throws. `InvalidVideoException` is non-retryable; `TranscodingFailedException` is retryable.

---

### 5.5 Embed Module

**Files:** [Server/src/embed/](Server/src/embed/)

#### BullMQ Queue: `embed-processing` (or `EMBED_QUEUE_NAME` env)

Job name: `process-embed`

**Handler:** `EmbedHandler` → `EmbedService.processEmbed`.

#### `EmbedService.processEmbed(data)`

1. Calls `EmbedClient.generateVector` with `[{ videoId, textToEmbed: title }, { videoId, textToEmbed: description }]`.
   - The Python AI server prefixes with `"passage: "` for document indexing.
2. Receives 768-dim float vectors for title (and optionally description).
3. Calls `QdrantService.upsertVideoPoint` with two named vectors: `titleDense` and `descDense`.
   - If no description, `descDense` falls back to the title vector.

#### EmbedClient

[Server/src/embed/embedservice/embed.client.ts](Server/src/embed/embedservice/embed.client.ts) — HTTP client to the Python AI server at `EMBED_API_URL`. Sends requests to `/vector/generate`, authenticates with `X-API-Key: EMBED_API_KEY`.

---

### 5.6 Search Module

**Files:** [Server/src/search/](Server/src/search/)

#### `SearchService.searchVideos(userId, query, limit, offset)`

Implements a **hybrid ranking** strategy:

1. **Keyword search** (PostgreSQL full-text): runs in parallel with step 2.
   - Uses `to_tsvector('english', video_name || ' ' || videoDesc) @@ plainto_tsquery(query)` on all `PUBLISHED` videos.
   - Returns `{ id, rank }` via `ts_rank_cd`.

2. **Vector search** (Qdrant): generates a `query:` prefixed embedding via EmbedClient, then calls `QdrantService.vectorSearch`:
   - Runs two prefetch queries against `titleDense` and `descDense` vector spaces.
   - Fuses with **DBSF** (Distribution-Based Score Fusion) — Qdrant's default.

3. **Score fusion**:
   - Normalise both scores to [0,1] by dividing by max in each result set.
   - Discard results where `rank/maxKw < 0.5` or `score/maxVec < 0.5` (noise filter).
   - Final score: `0.4 × kw_norm + 0.6 × vec_norm` (vector-weighted).
   - Sort descending; paginate with `offset` / `limit`.

4. Fetches full video metadata from PostgreSQL for the page, generates presigned thumbnail URLs from R2.

---

### 5.7 Notification Module

**Files:** [Server/src/notification/](Server/src/notification/)

#### Architecture

Notifications use **two separate transports**:
1. **Redis Streams** — durable, fan-out message bus (key: `notifications:stream`, group: `notify_wokers`).
2. **RxJS Subjects** (in-memory) — per-user observable that drives real-time GraphQL subscriptions.

#### `NotificationService.sendNotification(userId, subject, payload, type)`

1. Creates a `ChannelNotification` or `SystemNotification` DB record.
2. Fetches all subscriber user IDs for the channel.
3. Publishes to Redis Stream: `XADD notifications:stream * userId ... payload ... targetUserIds [...]`.

#### `NotificationConsumer`

Runs a blocking loop on module init:
- `XREADGROUP GROUP notify_wokers worker-<pid> COUNT 10 BLOCK 2000 STREAMS notifications:stream >`.
- For each message, calls `NotificationService.pushToDedicatedUser(targetUserIds, event)` which dispatches to all in-memory Subjects for connected users.
- Acknowledges processed messages with `XACK`.

#### `NotificationService.subscribe(userId)`

Returns (and creates if missing) an `RxJS Subject<NotificationEvent>` for the user. The GraphQL subscription resolver wraps this subject as an `AsyncIterator`.

---

### 5.8 Semantic Processing Module

**Files:** [Server/src/semantic-processing/](Server/src/semantic-processing/)

#### `SemanticProcessingService`

| Method | Description |
|---|---|
| `processingDescription(text)` | Strips URLs (http/https/www), removes all punctuation/symbols (`[^\p{L}\p{N}\s]`), collapses whitespace. Returns clean plain text. |
| `summarizeDescription(text)` | If text > 50 chars, calls `SummarizeClient.summarizeDescription` (Python AI server `/desc/summarize`). Returns a ≤150-word summary. |
| `normalizeText(text)` | NFC normalization → lowercase → remove punctuation/symbols → collapse whitespace. Used to normalize video titles before embedding. |

---

### 5.9 Tag Module

**Files:** [Server/src/tag/](Server/src/tag/)

`TagService.handleTags(videoId, tags)` manages the M2M relationship between a video and hashtags:
- For each display tag, normalizes (lowercase, trim) to a canonical form.
- Upserts the `Hashtag` record.
- Creates `VideoHashtag` records linking the video to each hashtag.
- Handles tag removals and increments/decrements `Hashtag.count`.

---

### 5.10 S3 / Cloudflare R2 Service

**File:** [Server/src/s3/s3.service.ts](Server/src/s3/s3.service.ts)

Uses the AWS SDK v3 (`@aws-sdk/client-s3`) pointed at the Cloudflare R2 endpoint.

#### Path Sharding

To avoid R2 bucket "hot spots", video files are stored under a content-addressed shard:

```
videos/<md5(videoId)[0:2]>/<md5(videoId)[2:4]>/<videoId>/<file>
```

Example: `videos/3e/7a/abc123/dash/manifest.mpd`

#### Key Methods

| Method | Description |
|---|---|
| `getPresignedUploadUrl` | 30-minute PUT URL for direct client upload. |
| `uploadFile` | Server-side buffer upload (used by video-processing worker). |
| `fileExists` | HEAD check before completing upload. |
| `getFileStream` | Streams file from R2 to local disk during processing. |
| `getPresignedDownloadUrl` | GET pre-signed URL (default 1h TTL) for thumbnails. |
| `getDownloadUrl` | Constructs `R2_WORKER_URL/<r2Path>` for DASH playback via the Cloudflare Worker. |
| `deleteDirectory` | Iterates ListObjectsV2 + DeleteObjects to remove an entire prefix. |
| `signUrl(expiresAt)` | Returns `HMAC-SHA256(R2_SIGN_SECRET, "${WORKER_KEY}:${expiresAt}")` — the token the Cloudflare Worker validates. |

---

### 5.11 Qdrant Service

**File:** [Server/src/qdrant/qdrant.service.ts](Server/src/qdrant/qdrant.service.ts)

#### Collection: `videos`

On module init:
- Creates collection if it doesn't exist with two named vector spaces:
  - `titleDense` — 768 dims, Cosine distance
  - `descDense` — 768 dims, Cosine distance
- HNSW config: `m=32`, `ef_construction=200`, `full_scan_threshold=2000`.
- Creates payload indexes on `videoId` (keyword), `userOwner` (keyword), `createdAt` (integer).

#### `upsertVideoPoint(point)`

Stores or overwrites a point identified by `videoId` (used as the Qdrant point ID). Payload: `{ videoId, userOwner, title, description, createdAt }`.

#### `vectorSearch(params)`

Issues a Qdrant `query` request with two `prefetch` clauses (one per vector space) and DBSF fusion. Returns `[{ id, score, payload }]`.

---

### 5.12 Queue Module

**File:** [Server/src/queue/queue.module.ts](Server/src/queue/queue.module.ts)

Global BullMQ module backed by Redis (`QUEUE_HOST:QUEUE_PORT`). Provides two queues:
- `video-processing` — consumed by `VideoProcessingHandler`.
- `embed-processing` (or `EMBED_QUEUE_NAME`) — consumed by `EmbedHandler`.

---

### 5.13 Prisma Module

**Files:** [Server/src/prisma/](Server/src/prisma/)

`PrismaModule` is global. `PrismaService` extends `PrismaClient` and calls `$connect()` on module init. Uses the `@prisma/adapter-pg` driver adapter with the `pg` package.

The schema uses two PostgreSQL schemas (`core`, `test`) enabled via the `postgresqlExtensions` preview feature.

---

## 6. GraphQL API Reference

Auto-generated from [Server/src/schema.gql](Server/src/schema.gql).

### Queries

| Query | Auth | Description |
|---|---|---|
| `me` | JWT | Returns current user ID. |
| `getUserVideos` | JWT | All videos owned by the authenticated user (including drafts). |
| `getWatchVideoMetadata(videoId)` | JWT | Full video metadata for playback page; increments view count. |
| `getWatchVideoUrl(videoId)` | JWT | Returns signed DASH manifest URL + HMAC signature + expiry. |
| `getVideoComments(videoId, cursorCreatedAt?, cursorId?)` | JWT | Paginated top-level comments (20 per page). |
| `searchVideos(query, limit=20, offset=0)` | JWT (TODO: check guard) | Hybrid keyword+vector search. |
| `getNotification` | none (TODO: guard missing) | Returns unread notifications for hardcoded test user. |
| `hello` | none | Health-check. |

### Mutations

| Mutation | Auth | Description |
|---|---|---|
| `signIn(ClientToken: {clientId})` | none | Google sign-in. Returns `{ user_id, accessToken }` + sets cookies. |
| `rotateToken` | JWT | Rotates access token. |
| `refresh` | none (cookie) | Rotates tokens from cookies. |
| `signOut` | JWT | Clears session. |
| `initUploadVideo(fileName, fileSize, mimeType)` | JWT | Returns `{ videoId, uploadId, presignedUrl }`. |
| `completeUploadVideo(uploadId)` | JWT | Triggers processing pipeline. |
| `updateVideo(videoId, title, tags?, description?, visibility, first_publish?)` | none (TODO: guard commented out) | Updates video metadata; triggers embedding. |
| `deleteVideo(videoId)` | none (TODO: guard commented out) | Deletes video from R2, Qdrant, DB. |
| `deleteVideoUpload(uploadId)` | JWT | Soft-delete alias (actually calls `deleteVideo`). |
| `commentOnVideo(videoId, content)` | JWT | Posts a comment. |
| `likeOrDislikeVideo(videoId, like)` | JWT | Like (`true`) or dislike (`false`). |
| `subscribeChannel(channelId, subscribe)` | JWT | Subscribe (`true`) / unsubscribe (`false`). |
| `trackVideoWatchProgress(videoId, pauseAt?)` | JWT | Saves resume position. |
| `updateVideoHistory(videoId)` | JWT | Marks video as watched. |
| `sendTestNotification(subject, payload, type)` | none | Dev/test only — sends notification. |

### Types

```graphql
type AuthPayload         { user_id: String!, accessToken: String! }
type InitUploadResponse  { videoId: String!, uploadId: String!, presignedUrl: String! }
type WatchVideoResponse  { id, videoName, duration, videoView, videoLike, videoDislike,
                           desc, tags, ownerId, ownerName, subscriberCount,
                           isSubscribe, isLiked, isDisliked, createdAt }
type WatchVideoUrlResponse { mpdUrl: String!, signature: String!, expiresAt: Float! }
type UserVideoResponse   { id, videoName, duration, videoUrl, thumbnailUrl,
                           videoView, videoLike, videoDislike, visibility,
                           rawDesc, tags, createdAt, updatedAt }
type SearchVideoItem     { id, videoName, thumbnailUrl, duration, videoView,
                           rawDesc, updatedAt, ownerName }
type SearchVideosResponse { results: [SearchVideoItem!]!, total: Int! }
type CommentContentResponse { id, content, createdAt, likeCount, replyCount, ownerName }
type LikeDislikeResponse { likeCount, dislikeCount }
type SubscribeChannelResponse { subscriberCount, isSubscribe }
type NotificationResponse { id, content, isRead }
```

---

## 7. Python AI Server (Embed\_Server)

**Location:** [Embed_Server/app/](Embed_Server/app/)

A **FastAPI** application exposing two AI endpoints, secured with an `X-API-Key` header.

### Models

#### Embedding: `intfloat/multilingual-e5-base`

- Sentence-Transformers model, **768-dimensional** dense vectors.
- Supports 100+ languages (important for multilingual video content).
- Uses the E5 instruction format: `"passage: <text>"` for documents, `"query: <text>"` for search queries.
- Device: CUDA if available, else CPU.
- Lazy-loaded on first request.

#### Summarization: `facebook/bart-large-cnn`

- HuggingFace seq2seq model trained on CNN/DailyMail summarization.
- Input truncated to 4000 chars / 1024 tokens.
- Output: 30–150 token abstractive summary, `num_beams=4`.
- Lazy-loaded on first request.

### Endpoints

#### `GET /health`
Returns `{ "status": "ok", "model_loaded": <bool> }`.

#### `POST /vector/generate`

Request body: one object **or** a list of objects:
```json
{
  "videoId": "string",
  "textToEmbed": "string",
  "isQuery": false
}
```
- `isQuery=true` prepends `"query: "` (for search-time embedding).
- `isQuery=false` (default) prepends `"passage: "` (for document indexing).

Response: matching single object or list:
```json
{ "videoId": "string", "vector": [0.12, -0.34, ...] }
```

#### `POST /desc/summarize`

Request body:
```json
{ "text": "long description..." }
```
Response: `"string"` (summarized text). If text ≤ 50 chars, returns the original unchanged.

---

## 8. Cloudflare R2 Worker

**Location:** [r2-worker/src/index.js](r2-worker/src/index.js)

A Cloudflare Worker that acts as a **secure CDN** in front of the R2 bucket. The NestJS server never exposes R2 bucket credentials to clients.

### How It Works

1. **Signature Validation:** Every incoming request must include `?sig=<hmac>&exp=<timestamp_ms>`.
   ```js
   createHmac("sha256", env.AUTH_SECRET)
     .update(`${env.WORKER_KEY}:${expires}`)
     .digest("hex")
   ```
   Additionally checks `Date.now() < expires` (expiry).
2. **Path Routing:** Only paths starting with `/video/` or `/videos/` are served. Others return 404.
3. **Range Request Support:** Parses `Range: bytes=start-end` headers and forwards `offset`/`length` to the R2 get call. Returns HTTP 206 Partial Content for streaming.
4. **Caching:** Uses `caches.default`. Responses are cached by full URL (including signature). `Cache-Control: public, max-age=3600`.
5. **CORS:** `Access-Control-Allow-Origin: *` — allows browser players to load segments cross-origin.
6. **Content Types:** `.mpd` → `application/dash+xml`, `.m4s` / `.mp4` → `video/mp4`.

### Environment Variables (Cloudflare Secrets)

| Variable | Description |
|---|---|
| `AUTH_SECRET` | HMAC signing secret (must match `R2_SIGN_SECRET` on NestJS server) |
| `WORKER_KEY` | Shared key component used in the HMAC `data` string |
| `BUCKET` | R2 bucket binding |

---

## 9. Infrastructure

All services can be started with Docker Compose. Files are in [Infra/](Infra/).

### PostgreSQL

```yaml
# Infra/Postgres/docker-compose.yml
image: postgres:16
container_name: video_platform_db
ports: "5434:5432"
database: video_streaming
credentials: postgres/postgres
```

Run: `docker compose -f Infra/Postgres/docker-compose.yml up -d`

### Redis

```yaml
# Infra/Redis/docker-compose.yml
image: redis:7-alpine
container_name: video-platform-redis
ports: "6379:6379"
persistence: appendonly yes
```

Run: `docker compose -f Infra/Redis/docker-compose.yml up -d`

### Qdrant

```yaml
# Infra/Qdrant/docker-compose.yml
image: qdrant/qdrant:v1.13.6
container_name: qdrant
ports: "6333:6333 (HTTP), 6334:6334 (gRPC)"
```

Run: `docker compose -f Infra/Qdrant/docker-compose.yml up -d`

Qdrant dashboard available at: `http://localhost:6333/dashboard`

---


## 10. Key Flows (End-to-End)

### 10.1 User Sign-In Flow

```
Client                          NestJS Server                    External
------                          -------------                    --------
  │                                   │
  │  POST /graphql                    │
  │  mutation signIn(clientId: <Google ID Token>)
  │ ─────────────────────────────────►│
  ││  verifyIdToken(idToken)
  │                                   │ ───────────────────────► Google Auth
  │                                   │ ◄─────────────────────── { email, sub }
  │                                   │
  │                                   │  AuthRepository.findByEmail(email)
  │                                   │ ──────────────────────────────────► PostgreSQL
  │                                   │ ◄────────────────────────────────── User row
  │                                   │
  │                                   │  JWT sign({ userId })
  │                                   │  randomBytes(64) → refreshToken
  │                                   │  bcrypt.hash(refreshToken)
  │                                   │
  │                                   │  Redis SET s:<sessionId> { userId, hash, createdAt }
  │                                   │ ────────────────────────────────────────────────► Redis
  │                                   │
  │  Set-Cookie: SSID=<sessionId>     │
  │  Set-Cookie: FTK=<refreshToken>   │
  │  { user_id, accessToken }         │
  │ ◄─────────────────────────────────│
```

---

### 10.2 Video Upload Flow

```
Client                          NestJS Server                    Cloudflare R2
------                          -------------                    -------------
  │                                   │
  │  mutation initUploadVideo(...)    │
  │ ─────────────────────────────────►│
  │                                   │  Validate mime type + file size
  │                                   │  Generate videoId (UUID) + uploadId (UUID)
  │                                   │
  │                                   │  S3.getPresignedUploadUrl → 30-min PUT URL
  │                                   │ ──────────────────────────────────────────► R2
  │                                   │ ◄────────────────────────────────────────── presignedUrl
  │                                   │
  │                                   │  DB transaction:
  │                                   │    INSERT VideoUpload (PENDING)
  │                                   │    INSERT Video (DRAFT)
  │                                   │
  │  { videoId, uploadId, presignedUrl }
  │ ◄─────────────────────────────────│
  │
  │  PUT <presignedUrl> [video bytes] ───────────────────────────────────────────► R2
  │ ◄─────────────────────────────────────────────────────────────────────────── 200 OK
  │
  │  mutation completeUploadVideo(uploadId)
  │ ─────────────────────────────────►│
  │                                   │  S3.fileExists(r2Path) ─────────────────► R2
  │                                   │  UPDATE VideoUpload → UPLOADED
  │                                   │  INSERT VideoProcessing (PENDING)
  │                                   │  BullMQ.add('transcode-video', { uploadId, r2Path, mimeType })
  │ ◄─────────────────────────────────│ true
```

---

### 10.3 Video Processing Flow

```
BullMQ Worker                   VideoProcessingService           Cloudflare R2
-------------                   ----------------------           -------------
  │                                   │
  │  Job: transcode-video             │
  │ ─────────────────────────────────►│
  │                                   │  UPDATE VideoProcessing → TRANSCODING
  │                                   │
  │                                   │  S3.getFileStream(r2Path) ──────────────► R2
  │                                   │  pipe to /tmp/<uploadId>/input.mp4
  │                                   │
  │                                   │  ffprobe → { duration, width, height }
  │                                   │
  │                                   │  ffmpeg DASH transcoding:
  │                                   │    - Select quality variants ≤ original resolution
  │                                   │    - libx264 + aac
  │                                   │    - 6s segments, GOP=48
  │                                   │    → /tmp/<uploadId>/dash/manifest.mpd
  │                                   │       /tmp/<uploadId>/dash/*.m4s
  │                                   │
  │                                   │  ffmpeg thumbnail at t=3s, 320px wide
  │                                   │    → /tmp/<uploadId>/thumb/0.jpg
  │                                   │
  │                                   │  Upload all artifacts to R2:
  │                                   │    videos/<shard>/<videoId>/dash/manifest.mpd
  │                                   │    videos/<shard>/<videoId>/dash/*.m4s
  │                                   │    videos/<shard>/<videoId>/thumb/0.jpg
  │                                   │    videos/<shard>/<videoId>/meta.json
  │                                   │ ─────────────────────────────────────────► R2
  │                                   │
  │                                   │  finalizeProcessingAndUpdateVideo:
  │                                   │    VideoProcessing → COMPLETED
  │                                   │    Video.videoUrl = manifest R2 path
  │                                   │    Video.thumbnailUrl = thumb R2 path
  │                                   │    VideoUpload.status → COMPLETED
  │                                   │
  │                                   │  rm -rf /tmp/<uploadId>/
```

---

### 10.4 Semantic Indexing Flow

Triggered when `updateVideo` is called (title or description changed):

```
VideoService                    BullMQ                  EmbedService            Python AI          Qdrant
------------                    ------                  ------------            --------           ------
  │                                │                        │                     │                 │
  │  processingDescription(desc)   │                        │                     │                 │
  │  → strip URLs, special chars   │                        │                     │                 │
  │                                │                        │                     │                 │
  │  summarizeDescription(desc)    │                        │                     │                 │
  │ ──────────────────────────────────────────────────────────────────────────►  POST /desc/summarize
  │ ◄────────────────────────────────────────────────────────────────────────── { summary }
  │                                │                        │                     │                 │
  │  normalizeText(title)          │                        │                     │                 │
  │                                │                        │                     │                 │
  │  addEmbedJob({ videoId, title, description, ... })
  │ ──────────────────────────────►│                        │                     │                 │
  │                                │  Job: process-embed ───►│                     │                 │
  │                                │                        │  POST /vector/generate
  │                                │                        │  [{ passage: title }, { passage: desc }]
  │                                │                        │ ─────────────────────►                 │
  │                                │                        │ ◄───────────────────── [vec1, vec2]   │
  │                                │                        │                                        │
  │                                │                        │  qdrant.upsertVideoPoint(videoId, { titleDense: vec1, descDense: vec2 })
  │                                │                        │ ─────────────────────────────────────►│
```

---

### 10.5 Hybrid Search Flow

```
Client                          SearchService                   PostgreSQL        Qdrant          Python AI
------                          -------------                   ----------        ------          ---------
  │                                   │                             │               │               │
  │  query searchVideos(query, limit) │                             │               │               │
  │ ─────────────────────────────────►│                             │               │               │
  │                                   │                             │               │               │
  │                                   │ keywordSearch(query) ──────►│               │               │
  │                                   │                             │  ts_rank_cd   │               │
  │                                   │ (parallel)                  │               │               │
  │                                   │ generateQueryVector(query) ─────────────────────────────►  │
  │                                   │ (prefix "query: ")         │               │  POST /vector/generate
  │                                   │ ◄───────────────────────────────────────────────────────── │
  │                                   │                             │               │               │
  │                                   │                             │  vectorSearch ►│               │
  │                                   │ ◄────────────────────────── keyword results │  ◄── vector hits
  │                                   │                             │               │               │
  │                                   │  Normalize scores to [0,1]  │               │               │
  │                                   │  Filter < 0.5 threshold     │               │               │
  │                                   │  finalScore = 0.4*kw + 0.6*vec             │               │
  │                                   │  Sort + paginate            │               │               │
  │                                   │                             │               │               │
  │                                   │ findManyByIds(page) ────────►│               │               │
  │                                   │ getPresignedDownloadUrl(thumbnails)         │               │
  │  { results: [...], total }        │                             │               │               │
  │ ◄─────────────────────────────────│                             │               │               │
```

---

### 10.6 Video Playback Flow

```
Client (MPEG-DASH Player)       NestJS                           Cloudflare Worker
--------------------------      ------                           -----------------
  │                                │                                   │
  │  query getWatchVideoUrl(videoId)                                   │
  │ ──────────────────────────────►│                                   │
  │                                │  S3Service.signUrl(expiresAt)     │
  │                                │  → HMAC-SHA256(R2_SIGN_SECRET, "WORKER_KEY:expiresAt")
  │                                │  S3Service.getDownloadUrl(video.videoUrl)
  │                                │  → R2_WORKER_URL/<r2_path>        │
  │  { mpdUrl, signature, expiresAt }                                  │
  │ ◄──────────────────────────────│                                   │
  │                                │                                   │
  │  GET <mpdUrl>?sig=<sig>&exp=<ts>                                   │
  │ ──────────────────────────────────────────────────────────────────►│
  │                                                                     │  validateToken: HMAC + expiry check
  │                                                                     │  R2 BUCKET.get(key)
  │  manifest.mpd (200 OK) ◄───────────────────────────────────────────│
  │                                                                     │
  │  GET <segment>.m4s?sig=<sig>&exp=<ts>  (Range: bytes=0-65535)      │
  │ ──────────────────────────────────────────────────────────────────►│
  │  206 Partial Content ◄─────────────────────────────────────────────│
```

---

### 10.7 Notification Flow

```
VideoService          NotificationService    Redis Stream          NotificationConsumer    Connected Client
------------          -------------------    ------------          --------------------    ---------------
  │                          │                    │                       │                     │
  │  sendNotification(...)   │                    │                       │                     │
  │ ────────────────────────►│                    │                       │                     │
  │                          │  createNotification (DB)                   │                     │
  │                          │  getSubscribedChannelUserIds               │                     │
  │                          │  XADD notifications:stream * {...}         │                     │
  │                          │ ──────────────────►│                       │                     │
  │                          │                    │                       │                     │
  │                          │                    │  XREADGROUP (blocking) │                     │
  │                          │                    │ ──────────────────────►│                     │
  │                          │                    │ ◄────────────── messages                    │
  │                          │                    │                       │                     │
  │                          │                    │  pushToDedicatedUser(targetUserIds, event)  │
  │                          │                    │                       │──── Subject.next ──►│
  │                          │                    │  XACK                 │                     │
  │                          │                    │ ◄─────────────────────│                     │
```

