# Video Platform Server — Process Documentation

<<<<<<< HEAD
**Last Updated:** 2026-07-07
=======
**Last Updated:** 2026-07-12
>>>>>>> main

This document describes the end-to-end workflows and processes that operate across the VideoPlatformServer system. Each process includes a sequence diagram illustrating the flow of data and control between services.

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Authentication Flow](#2-authentication-flow)
3. [Video Upload & Transcode Lifecycle](#3-video-upload--transcode-lifecycle)
4. [Embedding & Indexing Pipeline](#4-embedding--indexing-pipeline)
5. [Hybrid Search Flow](#5-hybrid-search-flow)
6. [Video Playback Flow](#6-video-playback-flow)
<<<<<<< HEAD
7. [Notifications Flow](#7-notifications-flow)
8. [Cross-Service Messaging (RabbitMQ)](#8-cross-service-messaging-rabbitmq)
=======
8. [Cross-Service Messaging (RabbitMQ)](#8-cross-service-messaging-rabbitmq)
9. [End-to-End Testing (Staging)](#9-end-to-end-testing-staging)
>>>>>>> main

---

## 1. System Architecture Overview

The system consists of three main runnables plus infrastructure services:

```mermaid
graph TB
    Client["Client<br/>(Browser/Mobile)"]
    API["api_service<br/>(NestJS 11 + Apollo GraphQL)"]
    Search["search_service<br/>(Python FastAPI)"]
<<<<<<< HEAD
    R2Worker["r2-worker<br/>(Cloudflare Worker)"]
=======
    R2Worker["r2-worker<br/>(Cloudflare Worker,<br/>deployed & versioned separately)"]
>>>>>>> main
    
    PG[("PostgreSQL 16<br/>(core schema)")]
    Redis[("Redis 7<br/>(sessions, BullMQ, cache)")]
    RabbitMQ[("RabbitMQ 3.13<br/>(cross-service messaging)")]
    Qdrant[("Qdrant 1.13.6<br/>(vector store)")]
    R2[("Cloudflare R2<br/>(video storage)")]
    
    Client -->|GraphQL over HTTPS| API
    Client -->|HTTP Range Requests| R2Worker
    
    API -->|Prisma ORM| PG
    API -->|ioredis, BullMQ| Redis
    API -->|AMQP| RabbitMQ
<<<<<<< HEAD
    API -->|REST/gRPC| Search
    
    Search -->|AMQP| RabbitMQ
    Search -->|gRPC| API
=======
    API -->|gRPC (bidirectional)| Search
    
    Search -->|AMQP| RabbitMQ
    Search -->|gRPC (bidirectional)| API
>>>>>>> main
    Search -->|Redis cache| Redis
    Search -->|Vector ops| Qdrant
    
    R2Worker -->|S3 API| R2
    API -->|S3 API| R2
    Search -->|S3 presigned URLs| R2
    
    style API fill:#4A90E2
    style Search fill:#7ED321
    style R2Worker fill:#F5A623
    style PG fill:#BD10E0
    style Redis fill:#FF6B6B
    style RabbitMQ fill:#FF9500
    style Qdrant fill:#50E3C2
    style R2 fill:#B8E986
```

**Key design principles:**
- **Async-first**: BullMQ for intra-service jobs, RabbitMQ for cross-service work
- **Event-driven**: Metadata changes trigger RabbitMQ events → search_service re-indexes
<<<<<<< HEAD
- **Decoupled metadata**: gRPC pull model (search_service fetches current truth from api_service)
=======
- **Bidirectional gRPC**: api_service acts as server for VideoMetaDataService (search_service client), search_service acts as server for DeleteVideoService (api_service client)
>>>>>>> main
- **Redis caching**: Frequently-used metadata cached with TTL to reduce gRPC calls
- **Vector-first search**: Hybrid keyword + dense vector scoring with dead-lettering for failures

---

## 2. Authentication Flow

**Entry point**: Firebase ID token verification → Session creation → JWT + Refresh token issuance

```mermaid
sequenceDiagram
    participant Client as Client<br/>(Browser)
    participant API as api_service<br/>(NestJS)
    participant Firebase as Firebase<br/>(External)
    participant PG as PostgreSQL
    participant Redis as Redis
    
    Client->>Firebase: Sign in with Google OAuth credentials
    Firebase-->>Client: ID token + Refresh token
    
    Client->>API: signIn(firebaseIdToken)
    API->>API: FirebaseService.verifyIdToken(firebaseIdToken)
    API->>Firebase: Verify token signature & expiry
    Firebase-->>API: ✓ DecodedIdToken { uid, email, ... }
    
    API->>PG: AuthRepository.findByEmail(email)
    PG-->>API: User record (or create if first-time)
    
    API->>API: Generate sessionId (UUID)
    API->>API: Generate refreshToken (128-hex-byte)
    API->>API: Hash refreshToken with bcryptjs (cost=10)
    
    API->>Redis: SET s:{sessionId} { userId, refreshToken_hash, createdAt }<br/>EX REFRESH_TOKEN_EXPIRES_IN
    Redis-->>API: OK
    
    API->>API: Create JWT accessToken (short-lived, ~15min)
    API-->>Client: { userId, sessionId, refreshToken, accessToken }
    
    Client->>Client: Store sessionId + refreshToken in HttpOnly cookies
    Client->>Client: Store accessToken in memory
    
    Note over Client,API: On every GraphQL request:
    Client->>API: Authorization: Bearer {accessToken}
    API->>API: JwtGuard verifies accessToken signature & expiry
    API-->>Client: ✓ Proceed or 401 Unauthorized
```

**Key points:**
- Firebase handles user identity verification (Google OAuth2 only)
- Session lives in Redis under `s:{sessionId}` for fast auth checks
- Refresh token is hashed before storage (prevents theft if Redis is compromised)
- Access token is short-lived (JWT); refresh token is long-lived (for rotating access)
- Two mechanisms for maintaining state: Redis session + JWT access token

**Related files:**
- `/api_service/src/auth/firebase.service.ts` — Firebase initialization & token verification
- `/api_service/src/auth/auth.service.ts` — Session creation, token rotation, sign-out
- `/api_service/src/auth/session.service.ts` — Redis wrapper for session management

---

## 3. Video Upload & Transcode Lifecycle

**Entry point**: `initUploadVideo` → R2 presigned URL → client direct upload → `completeUploadVideo` → BullMQ transcode job → FFmpeg DASH → R2 artifact storage

```mermaid
sequenceDiagram
    participant Client as Client
    participant API as api_service
    participant S3 as Cloudflare R2
    participant BullMQ as Redis<br/>(BullMQ)
    participant Worker as VideoProcessingService<br/>(BullMQ consumer)
    participant FFmpeg as FFmpeg
    
    Client->>API: initUploadVideo(fileName, mimeType, fileSize)
    API->>API: Validate MIME type & file size
    API->>API: Generate videoId (UUID), uploadId (UUID)
    
    API->>S3: Generate presigned PUT URL<br/>(expire: 30 minutes)<br/>Path: videos/{rand}/{rand}/{videoId}/raw.{ext}
    S3-->>API: presignedUrl
    
    API->>API: Create VideoUpload record (status: PENDING)
<<<<<<< HEAD
    API-->>Client: { videoId, uploadId, presignedUrl, r2Path }
=======
    API-->>Client: { videoId, uploadId, presignedUrl, objectPath }
>>>>>>> main
    
    Client->>S3: PUT {presignedUrl}<br/>+ file bytes
    S3-->>Client: 200 OK
    
    Client->>API: completeUploadVideo(videoId)
    API->>API: Verify file exists in R2
    
    API->>API: Create VideoProcessing record (type: VIDEO)
    API->>API: Update VideoUpload (status: UPLOADED)
    
<<<<<<< HEAD
    API->>BullMQ: Queue transcode job<br/>{ processingId, inforId, r2Path, mimeType }
=======
    API->>BullMQ: Queue transcode job<br/>{ processingId, inforId, objectPath, mimeType }
>>>>>>> main
    BullMQ-->>API: Job ID returned
    API-->>Client: ✓ Upload complete, transcoding started
    
    Note over BullMQ,Worker: Async BullMQ worker<br/>(may run later or on different instance)
    
    BullMQ-->>Worker: Dequeue transcode job
    Worker->>S3: Download raw video file to /tmp/
    
    Worker->>FFmpeg: transcode(inputPath, outputDir)<br/>- Select quality variants ≤ source resolution<br/>- libx264 + aac codecs<br/>- 6-second segments, GOP=48<br/>- Output: MPEG-DASH manifest.mpd + *.m4s
    FFmpeg-->>Worker: ✓ /tmp/{uploadId}/dash/
    
    Worker->>FFmpeg: Extract thumbnail at t=3s (320px wide)
    FFmpeg-->>Worker: /tmp/{uploadId}/thumb/0.jpg
    
    Worker->>S3: Upload all artifacts to R2<br/>videos/{shard}/{shard}/{videoId}/dash/manifest.mpd<br/>videos/{shard}/{shard}/{videoId}/dash/*.m4s<br/>videos/{shard}/{shard}/{videoId}/thumb/0.jpg
    S3-->>Worker: ✓ All uploaded
    
    Worker->>API: finalize via Prisma<br/>- VideoProcessing.status = COMPLETED<br/>- Video.videoUrl = manifest path<br/>- Video.thumbnailUrl = thumb path<br/>- VideoUpload.status = COMPLETED
    
    Worker->>Worker: rm -rf /tmp/{uploadId}/
    BullMQ-->>Worker: ✓ Job acknowledged
```

**Key points:**
- **Presigned upload**: Client bypasses api_service for the actual video file (direct-to-R2), reducing server bandwidth
- **Path sharding**: `md5(videoId)[0:2]/[2:4]/videoId/` creates 65,536 buckets to avoid S3 hot-partition problems
- **Async transcoding**: BullMQ decouples upload completion from transcoding, allowing fast HTTP response
- **FFmpeg DASH output**: Adaptive bitrate MPEG-DASH for playback on low/high bandwidth clients
- **Thumbnail extraction**: Automatic at t=3s for preview in search results

**Related files:**
- `/api_service/src/video/video.service.ts` — `initUpload()`, `completeUpload()` methods
- `/api_service/src/video-processing/video-processing.queue.ts` — BullMQ job enqueuing
- `/api_service/src/video-processing/video-processing.service.ts` — FFmpeg transcoding logic
- `/api_service/src/s3/s3.service.ts` — R2 API calls (presigned URLs, uploads, downloads)

---

## 4. Embedding & Indexing Pipeline

**Entry point**: `updateVideo` → Publish RabbitMQ message → search_service consumer → fetch metadata via gRPC → generate embeddings → upsert Qdrant → publish result acknowledgement

```mermaid
sequenceDiagram
    participant Client as Client
    participant API as api_service
    participant RabbitMQ as RabbitMQ<br/>(exchange: video.processing)
    participant Search as search_service<br/>(FastAPI)
    participant gRPC as gRPC Channel
    participant Redis as Redis
    participant Qdrant as Qdrant
    
    Client->>API: updateVideo(videoId, title?, description?, tags?)
    API->>API: Validate ownership, get current video
    API->>API: Update Video table (title, description, visibility)
    
    API->>RabbitMQ: publish(routing_key='video.metadata.trans',<br/>{ correlationId, videoId, title?, description?, hashtags? })
    RabbitMQ-->>API: ✓ Message queued
    API-->>Client: ✓ Video updated
    
    Note over RabbitMQ,Search: Async consumer (may start immediately or minutes later)
    
    RabbitMQ-->>Search: Consume from queue 'video.meta.transfer'
    Search->>gRPC: GetVideoMetadata(videoId)
    gRPC->>API: gRPC request
    API->>API: Look up Video record by videoId
    API-->>gRPC: VideoMetadata { title, description, hashtags, visibility, ... }
    gRPC-->>Search: ✓ Metadata received
    
    Search->>Search: normalize_title(title) — lowercase, strip special chars
    Search->>Search: normalize_desc(description) — URL strip, special char removal
    
    Search->>Search: EmbeddingService.embed_dense(title)<br/>→ 768-dim dense vector (multilingual-e5-base)
    Search->>Search: EmbeddingService.embed_dense(description)<br/>→ 768-dim dense vector (if desc exists)
    Search->>Search: EmbeddingService.embed_sparse(title + " " + description)<br/>→ sparse BM25-style vector
    
    Search->>Qdrant: upsert_video_point(videoId,<br/>{ titleDense: vec1, descDense: vec2, sparse: vec3,<br/>title: norm_title, desc: norm_desc, user_id: ... })
    Qdrant-->>Search: ✓ Point upserted
    
    Search->>Redis: MSET [meta:{videoId}] = { video_id, title, description, ... }<br/>EX META_CACHE_TTL (default 3600s)
    Redis-->>Search: ✓ Metadata cached
    
    Search->>RabbitMQ: publish(routing_key='video.metadata.res',<br/>{ correlationId, status: 'succeeded' })
    RabbitMQ-->>Search: ✓ Result published
```

**Key points:**
- **Thin event model**: RabbitMQ message is a trigger (`videoId`, `correlationId`) only; metadata is fetched on-demand via gRPC
- **gRPC pull**: Guarantees search_service always indexes the latest committed row, not stale snapshot
- **Normalization**: Title and description cleaned before embedding to improve vector quality
- **Dual vectors**: Title and description get separate 768-dim dense vectors for fine-grained search (title match vs. description match)
- **Sparse vector**: BM25-style for keyword fallback if dense search scores are low
- **Redis caching**: Metadata cached to reduce gRPC calls on repeated searches
- **Acknowledgement**: Result message published to `video.metadata.res` for auditing and retry tracking

**Related files:**
- `/api_service/src/video/video.service.ts` — `updateVideo()` method, calls PublisherService
- `/api_service/src/rabbitmq/publisher.service.ts` — Publishes metadata transfer message
- `/search_service/src/app/worker/consumer.py` — Consumes `video.metadata.trans` messages
<<<<<<< HEAD
- `/search_service/src/domain/service/metadata_process.py` — Orchestrates normalize → embed → upsert
=======
- `/search_service/src/domain/service/video.py` — Video class orchestrates normalize → embed → upsert (replaces metadata_process.py)
>>>>>>> main
- `/search_service/src/domain/service/normalize.py` — Text normalization rules
- `/search_service/src/infrastructure/ml_model/embeding_model.py` — Dense/sparse embedding calls
- `/search_service/src/infrastructure/database/qdrant.py` — Qdrant upsert operations
- `/search_service/src/infrastructure/redis/redis.py` — Redis metadata cache
<<<<<<< HEAD
=======
- `/search_service/src/core/config.py` — Centralized configuration (GRPC_URL, MQ_URL, etc.)
>>>>>>> main

---

## 5. Hybrid Search Flow

**Entry point**: `searchVideos(query)` → Parallel keyword search (PostgreSQL FTS) + vector search (Qdrant) → Redis metadata cache with gRPC fallback → Score fusion & ranking → Presigned URLs

```mermaid
sequenceDiagram
    participant Client as Client
    participant API as api_service
    participant PG as PostgreSQL
    participant Search as search_service
    participant Qdrant as Qdrant
    participant Redis as Redis
    participant gRPC as gRPC Channel
    participant S3 as Cloudflare R2
    
    Client->>API: searchVideos(query, limit, offset)
    API->>Search: GET /search?q={query}&limit={limit}
    
    par Keyword Search (PostgreSQL)
        Search->>Search: normalize_search_query(query)
        Search->>PG: Full-text search (ts_rank_cd)<br/>WHERE tsv @@ plainto_tsquery(query)<br/>ORDER BY ts_rank_cd DESC LIMIT {limit}
        PG-->>Search: List of { video_id, title, description, rank_score }
    and Vector Search (Qdrant)
        Search->>Search: normalize_search_query(query)
        Search->>Search: EmbeddingService.embed_dense(query)<br/>→ 768-dim vector
        Search->>Search: EmbeddingService.embed_sparse(query)<br/>→ sparse vector
        Search->>Qdrant: search_points(dense_vec, sparse_vec, userId)<br/>Retrieve top-k points, normalized scores
        Qdrant-->>Search: List of { id, score } sorted desc
    end
    
    Search->>Search: Normalize scores to [0, 1]
    Search->>Search: Filter results where score < 0.5 (threshold)
    Search->>Search: Hybrid score = 0.4 × keyword_score + 0.6 × vector_score
    Search->>Search: Sort by hybrid score DESC, paginate by limit/offset
    
    Search->>Redis: MGET [meta:{vid1}, meta:{vid2}, ...]
    Redis-->>Search: List of cached metadata (or nulls for missing)
    
    alt Missing Metadata
        Search->>Search: Identify missing video_ids
        Search->>Search: Check _inflight_requests for concurrent gRPC calls
        Search->>gRPC: GetVideoMetadata(missing_video_ids)
        gRPC->>API: Batch metadata lookup
        API-->>gRPC: VideoMetadata[]
        gRPC-->>Search: Metadata received
        Search->>Redis: Cache metadata for future queries (MSET with TTL)
        redis-->>Search: ✓ Cached
    end
    
    Search->>Search: Merge cached + fetched metadata
    Search->>Search: Reorder results by hybrid score (from Qdrant/PG)
    
    par Generate Presigned URLs
        Search->>S3: For each thumbnail_url, generate presigned download URL (1-hour expiry)
        S3-->>Search: List of presigned URLs
    end
    
    Search-->>API: { results: [...VideoMetadata], total }
    API-->>Client: GraphQL response with video details + thumbnail URLs
```

**Key points:**
- **Parallelization**: Keyword (PostgreSQL) and vector (Qdrant) searches run concurrently
- **Score normalization**: Both search types normalized to [0, 1] before fusion
- **Hybrid fusion**: 40% keyword + 60% vector weight (tunable, favors semantic relevance)
- **Threshold filtering**: Results < 0.5 dropped to avoid low-quality suggestions
- **Metadata caching**: Redis TTL prevents repeated gRPC lookups for hot videos
- **Deduplication**: Concurrent requests for same metadata use asyncio.Event to block on one gRPC call
- **Presigned URLs**: Thumbnails signed for 1 hour; prevents long-lived leakage of R2 paths
- **User isolation**: Qdrant searches scoped by user_id to respect privacy (private/draft videos excluded)

**Related files:**
- `/api_service/src/search/search.service.ts` — GraphQL mutation `searchVideos()`
- `/search_service/src/app/api/v1/endpoint/search.py` — FastAPI `/search` endpoint
- `/search_service/src/domain/service/search.py` — SearchService with hybrid scoring
<<<<<<< HEAD
- `/search_service/src/infrastructure/grpc/grpc_client.py` — gRPC metadata fetching
- `/search_service/src/infrastructure/redis/redis.py` — Redis caching logic
=======
- `/search_service/src/infrastructure/grpc/grpc_client.py` — gRPC metadata fetching (api_service client)
- `/search_service/src/infrastructure/grpc/grpc_server.py` — gRPC server for DeleteVideoService (api_service calls this)
- `/search_service/src/infrastructure/redis/redis.py` — Redis caching logic
- `/api_service/src/grpc/client/grpc-client.service.ts` — gRPC client for DeleteVideoService
- `/api_service/src/grpc/server/video-metadata/` — gRPC server for VideoMetaDataService
>>>>>>> main

---

## 6. Video Playback Flow

<<<<<<< HEAD
=======
> **Note:** `/r2-worker` was removed from this repository, but this is a repo-organization change only — the Cloudflare Worker itself is deployed and versioned in a separate repository/pipeline and is still live at `R2_WORKER_URL`. `S3Service.getDownloadUrl()`/`signUrl()` continue to work unchanged; there is no coupling between this monorepo's contents and the deployed worker.

>>>>>>> main
**Entry point**: `getWatchVideoUrl(videoId)` → HMAC-signed URL generation → Cloudflare Worker validation → Range-request streaming from R2

```mermaid
sequenceDiagram
    participant Client as Client<br/>(MPEG-DASH Player)
    participant API as api_service
    participant S3 as Cloudflare R2
<<<<<<< HEAD
    participant Worker as r2-worker<br/>(Cloudflare)
=======
    participant Worker as r2-worker<br/>(Cloudflare, deployed separately)
>>>>>>> main
    
    Client->>API: getWatchVideoUrl(videoId)
    API->>API: Verify video exists & is not PRIVATE/DRAFT<br/>(or owned by user)
    API->>API: S3Service.getDownloadUrl(video.videoUrl)<br/>→ Construct R2_WORKER_URL/{r2_path}
    
    API->>API: Calculate expiresAt = Date.now() + 100 minutes
    API->>API: S3Service.signUrl(expiresAt)<br/>→ HMAC-SHA256(R2_SIGN_SECRET,<br/>"WORKER_KEY:{expiresAt}")<br/>→ signature
    
    API-->>Client: { mpdUrl, signature, expiresAt }
    
    Client->>Worker: GET {mpdUrl}?sig={signature}&exp={expiresAt}
    Worker->>Worker: Validate signature: HMAC(R2_SIGN_SECRET, "WORKER_KEY:{expiresAt}")
    Worker->>Worker: Verify exp > Date.now()
    
    alt Signature + Expiry Valid
        Worker->>S3: GET {r2_path}/dash/manifest.mpd
        S3-->>Worker: manifest.mpd file content
        Worker-->>Client: 200 OK + manifest.mpd
        
        Note over Client,Worker: Client parses manifest, requests video segments
        Client->>Worker: GET {mpdUrl}/dash/{segment}.m4s?sig={sig}&exp={exp}<br/>+ Range: bytes={start}-{end}
        Worker->>Worker: Validate signature + expiry again
        Worker->>S3: GET {r2_path}/dash/{segment}.m4s Range: bytes={start}-{end}
        S3-->>Worker: 206 Partial Content + segment bytes
        Worker-->>Client: 206 Partial Content + segment bytes
    else Signature Invalid or Expired
        Worker-->>Client: 403 Forbidden (signature mismatch or expired)
    end
```

**Key points:**
- **HMAC signing**: Prevents URL tampering and unauthorized playback
- **Time-limited URLs**: 100-minute expiry covers a typical watch session + replay
<<<<<<< HEAD
- **Cloudflare Worker as proxy**: Validates signature server-side before proxying to R2 (prevents signature disclosure to client)
=======
- **Cloudflare Worker as proxy**: Validates signature server-side before proxying to R2 (prevents signature disclosure to client); source lives in its own repo, not this monorepo
>>>>>>> main
- **Range-request support**: Worker proxies HTTP Range headers for efficient segment streaming
- **Manifest + segments**: Both must be signed separately (client re-signs segment requests after parsing manifest)
- **Privacy enforcement**: api_service checks visibility before generating URL (private videos only for owner)

**Related files:**
- `/api_service/src/video/video.service.ts` — `getWatchVideoUrl()` method
- `/api_service/src/s3/s3.service.ts` — `signUrl()` and `getDownloadUrl()` methods
<<<<<<< HEAD
- `/r2-worker/src/index.js` — Cloudflare Worker HMAC validation + R2 proxy logic
- `/proto/video.proto` — Not directly used, but defines video ownership rules

---

## 7. Notifications Flow

**Entry point**: Event triggered (video upload complete, new comment, subscription change) → Redis Stream → Consumer processes → Per-user RxJS Subject → GraphQL subscriptions

```mermaid
sequenceDiagram
    participant VideoSvc as VideoService<br/>(api_service)
    participant NotifSvc as NotificationService<br/>(api_service)
    participant PG as PostgreSQL
    participant Redis as Redis Stream
    participant Consumer as NotificationConsumer<br/>(BullMQ or timer-based)
    participant Memory as In-Memory<br/>RxJS Subjects
    participant GraphQL as GraphQL Subscription
    participant Client as Client
    
    Note over VideoSvc,Client: Scenario: User completes video upload
    VideoSvc->>NotifSvc: sendNotification(type: 'VIDEO_UPLOADED',<br/>fromUserId, toUserIds, payload)
    
    NotifSvc->>PG: INSERT INTO Notification<br/>{ type, fromUserId, toUserId, payload, createdAt }
    
    NotifSvc->>PG: Query subscribed users<br/>SELECT subscribers WHERE channelId = video.userId
    PG-->>NotifSvc: List of subscriber user IDs
    
    loop For each subscriber
        NotifSvc->>Redis: XADD notifications:stream *<br/>{ event: 'VIDEO_UPLOADED', videoId, uploaderId, ... }
        Redis-->>NotifSvc: Stream entry ID
    end
    NotifSvc-->>VideoSvc: ✓ Notifications queued
    
    Note over Consumer,GraphQL: Async consumer (polling or timer-based)
    Consumer->>Redis: XREADGROUP<br/>GROUP notify_workers CONSUMER_1<br/>STREAMS notifications:stream >
    Redis-->>Consumer: [{ entry_id, payload }, ...]
    
    loop For each message
        Consumer->>Consumer: Parse payload
        Consumer->>Memory: subject = getOrCreateSubject(toUserId)
        Consumer->>Memory: subject.next(notification)
        Memory-->>Consumer: ✓ RxJS Subject updated
        Consumer->>Redis: XACK notifications:stream notify_workers {entry_id}
        Redis-->>Consumer: ✓ Acknowledged
    end
    
    Note over GraphQL,Client: Client has open WebSocket subscription
    Client->>GraphQL: subscribe { onNotification { type, payload } }
    GraphQL->>Memory: Register listener to subject for userId
    
    Memory-->>GraphQL: New notification received
    GraphQL-->>Client: Push notification via WebSocket
    Client->>Client: Update UI (toast, badge, etc.)
```

**Key points:**
- **Dual-layer storage**: Notification record in PostgreSQL for audit trail, Redis Stream for real-time dispatch
- **Consumer group pattern**: RabbitMQ-like acknowledgement mechanism (XACK) prevents duplicate delivery if consumer crashes
- **In-memory subjects**: Per-user RxJS Subject holds only actively-subscribed clients (lightweight)
- **Graceful degradation**: If consumer is down, notifications wait in Redis Stream until consumer restarts
- **Subscription-aware**: Notifications only sent to users who subscribe to the video creator's channel
- **Event types**: VIDEO_UPLOADED, NEW_COMMENT, USER_SUBSCRIBED, etc. (extensible)

**Related files:**
- `/api_service/src/notification/notification.service.ts` — `sendNotification()` method, Redis Stream publishing
- `/api_service/src/notification/notification.resolver.ts` — GraphQL subscription resolver (onNotification)
- `/api_service/src/notification/notification.consumer.ts` — Consumer that polls Redis Stream and dispatches to subjects
- `/api_service/src/notification/notification.gateway.ts` — WebSocket gateway for subscription delivery

---
=======
- r2-worker source (Cloudflare Worker HMAC validation + R2 proxy logic) — lives in a separate repository, not under `/r2-worker` here

---

>>>>>>> main

## 8. Cross-Service Messaging (RabbitMQ)

RabbitMQ is the asynchronous backbone for video metadata synchronization between api_service and search_service.

### 8.1 Topology

```
Exchange: video.processing (type: topic, durable)
├── Routing key: video.metadata.trans  → Queue: video.meta.transfer
│   Producer: api_service.PublisherService
│   Consumer: search_service consumer.py
│   Payload: { correlationId, videoId, title?, description?, hashtags? }
│   Purpose: Trigger video metadata processing (embedding, Qdrant upsert)
│
├── Routing key: video.metadata.res  → Queue: video.metadata.response
│   Producer: search_service consumer.py
│   Consumer: (future: api_service, for result tracking)
│   Payload: { correlationId, status: 'succeeded'|'failed' }
│   Purpose: Acknowledgement of successful embedding
│
└── Routing key: video.vector.delete  → Queue: video.vector.delete
    Producer: api_service (on video deletion)
    Consumer: search_service
    Payload: { videoId }
    Purpose: Remove vector from Qdrant collection

Exchange: video.processing.dlx (type: topic, durable)
└── Routing key: # (all)  → Queue: video.metadata.dead-letter
    Captures: Messages rejected, expired (TTL 5min), or nacked
    Purpose: Manual inspection and replay of failed messages
```

### 8.2 Message Flow Diagram

```mermaid
graph LR
    API["api_service<br/>(Publisher)"]
    MQ["RabbitMQ<br/>video.processing<br/>(topic exchange)"]
    DLX["video.processing.dlx<br/>(dead-letter exchange)"]
    Search["search_service<br/>(Consumer)"]
    DLQ["DLQ<br/>video.metadata.dead-letter"]
    
    API -->|"publish<br/>routing_key=video.metadata.trans"| MQ
    
    MQ -->|"route to queue<br/>video.meta.transfer"| Search
    
    Search -->|"nack or<br/>TTL expired"| DLX
    
    DLX -->|"route with<br/>routing_key=#"| DLQ
    
    Search -->|"publish<br/>routing_key=video.metadata.res"| MQ
    
    style API fill:#4A90E2
    style MQ fill:#FF9500
    style DLX fill:#FF6B6B
    style Search fill:#7ED321
    style DLQ fill:#BD10E0
```

### 8.3 Error Handling & Retries

```mermaid
sequenceDiagram
    participant API as api_service
    participant MQ as RabbitMQ
    participant Search as search_service
    participant DLX as DLX
    participant DLQ as Dead-Letter Queue
    
    API->>MQ: Publish video.metadata.trans<br/>with persistent=true
    MQ-->>API: OK
    
    MQ->>Search: Deliver message (attempt 1)
    
    alt Processing succeeds
        Search->>Search: Process metadata
        Search->>MQ: Acknowledge (BASIC.ACK)
        MQ->>MQ: Remove from queue
    else Processing fails (exception)
        Search->>MQ: Nack with requeue=false
        MQ->>DLX: Route to DLX with x-death header
        DLX->>DLQ: Route to dead-letter queue
        DLQ-->>DLQ: Message stored for manual inspection
        Note over DLQ: Ops must manually diagnose & replay
    else Message TTL expires (5 min)
        Note over MQ,Search: Message sat in queue too long
        MQ->>DLX: Route to DLX on TTL expiry
        DLX->>DLQ: Route to dead-letter queue
    end
```

### 8.4 Setup (Environment Variables & Docker)

<<<<<<< HEAD
**Docker Compose:**
```yaml
version: '3.8'
services:
  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    container_name: video-platform-rabbitmq
    ports:
      - "5672:5672"   # AMQP
      - "15672:15672" # Management UI
    environment:
      RABBITMQ_DEFAULT_USER: video_platform
      RABBITMQ_DEFAULT_PASS: change_me_in_prod
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  rabbitmq_data:
```

**Environment Variables:**
- `RABBITMQ_URI=amqp://video_platform:PASSWORD@localhost:5672` (api_service)
- `RABBITMQ_URI=amqp://video_platform:PASSWORD@localhost:5672` (search_service)
=======
See root-level `docker-compose.yml` and service-specific `.env` files for current configuration. (Previous docker-compose files for individual services have been consolidated.)

**Environment Variables:**
- `RABBITMQ_URI=amqp://video_platform:PASSWORD@{host}:5672` (api_service and search_service)
- `RABBITMQ_EXCHANGE=video.processing` (topic exchange name)
- `RABBITMQ_QUEUE=video.meta.transfer` (queue for metadata processing)
>>>>>>> main

**Management UI:** `http://localhost:15672` (login: `video_platform` / password)

### 8.5 Key Design Decisions

| Decision | Rationale |
|---|---|
| **Topic exchange** | Allows routing by message type without hardcoding queue names; enables future message types (e.g., `video.vector.delete`) |
| **Durable queues & persistent messages** | Survives broker restart; in-progress work is never lost |
| **Per-queue DLX binding** | Automatic dead-lettering of failures; no manual exception handling in consumer code |
| **TTL on messages (5 min)** | Prevents queue from growing if all consumers are down; failed messages move to DLQ instead of looping |
| **Thin event + gRPC pull** | RabbitMQ is a trigger only; metadata fetched on-demand ensures search_service always has latest truth |
| **Result queue (video.metadata.res)** | Enables future auditing, replay logic, and decoupling of result processing from triggering |

---

<<<<<<< HEAD
## Summary: Known Issues & In-Progress Work

### 1. **CRITICAL: Field Name Mismatch in RabbitMQ Message (Bug)**
- **Location**: Publisher vs. Consumer payload field
- **Issue**: `api_service/src/rabbitmq/publisher.service.ts` sends `description` field, but `search_service/src/app/worker/consumer.py` expects `desc` field
- **Impact**: Search service consumer receives `desc=undefined`, so embeddings are generated without description text
- **Fix**: Either:
  - Change publisher to send `desc` instead of `description`, OR
  - Change consumer to expect `description` instead of `desc`
- **Recommendation**: Use `description` (more explicit); update consumer line 20 from `desc = payload.get('desc')` to `description = payload.get('description')`

### 2. **CRITICAL: Auth Guard Gaps**
- **Location**: `/api_service/src/video/video.resolver.ts` mutations
- **Issue**: `updateVideo` and `deleteVideo` mutations have `@UseGuards(GqlAuthGuard)` commented out
- **Additional issue**: `updateVideo` is hardcoded with test user ID `"@jrALUe0g"` instead of passing the authenticated user's ID
- **Security impact**: Any authenticated user can update/delete any video, not just their own
- **Fix needed**:
  1. Uncomment `@UseGuards(GqlAuthGuard)` decorators
  2. Replace hardcoded user ID with actual authenticated user from context
  3. Add ownership validation in `VideoService.updateVideo()` and `VideoService.deleteVideo()`

### 3. **Qdrant Ownership Migration**
- **Current state**: Qdrant is managed by both api_service and search_service
- **Issue**: `api_service/src/video/video.service.ts` calls `this.qdrantService.deleteVideoVector(videoId)` directly on video deletion
- **Target**: search_service should own Qdrant; api_service should publish `video.vector.delete` RabbitMQ event instead
- **Status**: In progress; see `/VideoPlatformServer/QDRANT_MIGRATION.md`
- **Impact on docs**: This documentation describes the target end state; current code has direct Qdrant calls in api_service
- **Workaround**: Currently both services have Qdrant access; duplication is safe but not ideal

### 4. **Search Service Refactor**
- **Changes**: 
  - Added gRPC metadata fetching (instead of fat RabbitMQ events)
  - Added Redis caching with TTL management for metadata
  - Introduced dense + sparse vector search with hybrid scoring
  - Added inflight request deduplication using asyncio.Event
- **Files changed**: `search_service/src/domain/service/search.py`, `consumer.py`, `metadata_process.py`, `grpc_client.py`, `redis.py`
- **Docs impact**: DOCUMENTATION.md section 10.5 may be outdated; this PROCESSES.md reflects the new architecture

### 5. **RabbitMQ Publisher Module**
- **Recent addition**: `api_service/src/rabbitmq/publisher.module.ts` and `publisher.service.ts`
- **Purpose**: Centralized RabbitMQ publishing for video metadata events
- **Status**: Integrated into `VideoService.updateVideo()` workflow
- **Note**: New file `publisher.module.ts` defines the RabbitMQ client module export


---

**Generated:** 2026-07-07  
<!-- **Verified against:**
- api_service/src/video/video.service.ts
- api_service/src/auth/auth.service.ts
- api_service/src/rabbitmq/publisher.service.ts
- search_service/src/app/worker/consumer.py
- search_service/src/domain/service/metadata_process.py
- search_service/src/domain/service/search.py -->
=======



**Generated:** 2026-07-12  

## Changes from 2026-07-07 Refactor

**Major refactoring on feat/refactor branch:**

1. **gRPC Restructured**: Reorganized from flat `api_service/src/grpc/` to `api_service/src/grpc/server/video-metadata/` and new `api_service/src/grpc/client/`. Added bidirectional gRPC setup: api_service acts as server for VideoMetaDataService, search_service acts as server for DeleteVideoService.

2. **Proto Replaced**: `proto/video.proto` replaced with `proto/video.proto`. New proto defines two services: VideoMetaDataService (client=search_service, server=api_service) and DeleteVideoService (client=api_service, server=search_service).

3. **r2-worker Directory Removed From Monorepo**: `/r2-worker` deleted from this repo, but the Cloudflare Worker is deployed/versioned separately and is unaffected at runtime. Playback flow (Section 6) is unchanged and still works as documented.

4. **search_service Metadata Processing**: `metadata_process.py` deleted and replaced with `video.py` (Video class). New centralized config in `core/config.py`. `consumer.py` was still calling the deleted `container.metadata_process.process()` — fixed to call `container.video.process_metadata()`.

5. **Notification Module**: Heavy refactoring (+506 -415 lines) but behavior unchanged.

---

## 9. End-to-End Testing (Staging)

`test/` (sibling to `api_service/` and `search_service/`) holds black-box e2e suites written in TypeScript/Jest. They never import either service's source or spawn one service from the other -- they only talk over the network (GraphQL, REST, RabbitMQ, Redis, Postgres, Qdrant), so the same suite runs against two different targets depending on env vars:

- **Local / CI default**: `docker/docker-compose.staging.yml` builds and runs real `api_service`/`search_service` containers alongside Postgres x2, Redis x2, RabbitMQ, and Qdrant. Copy `docker/staging.env.example` to `docker/staging.env`, fill in a real, disposable S3/R2 bucket's credentials (api_service's `S3Service` always talks to a real bucket -- there is no local fake), then:
  ```bash
  docker compose -f docker/docker-compose.staging.yml up -d --build --wait
  npm --prefix test ci
  npm --prefix test test
  docker compose -f docker/docker-compose.staging.yml down -v
  ```
- **A real deployed staging**: set `STAGING_API_URL`, `STAGING_SEARCH_URL`, `STAGING_API_DATABASE_URL`, `STAGING_REDIS_SEARCH_URL`, `STAGING_RABBITMQ_URI`, `STAGING_QDRANT_URL`, `STAGING_JWT_SECRET` (see `test/e2e/support/env.ts`) and run `npm --prefix test test` -- no other changes needed.

**Suites:**
- `video-publish.e2e-spec.ts` -- upload -> real ffmpeg transcode -> metadata update -> RabbitMQ round trip to search_service, asserted via `core.video_upload.video_status`/`meta_status` in api_service's Postgres and an independent Qdrant point read.
- `search.e2e-spec.ts` -- Redis cache-key correctness (`search:{userId}:{queryId}`, `meta:{videoId}`) and correctness of search_service's gRPC metadata re-fetch from api_service on a cache miss.

CI wiring lives in `.github/workflows/e2e.yml`.


>>>>>>> main
