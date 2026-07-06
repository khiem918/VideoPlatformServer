# VideoPlatformServer

Backend for the VideoPlatform project. Composed of two cooperating services — a **NestJS GraphQL API** (`api_service/`) and a **Python FastAPI search/embedding service** (`search_service/`) — communicating over **gRPC** and **RabbitMQ**, backed by **PostgreSQL**, **Redis**, **Qdrant**, and a **Cloudflare R2** worker.

> Branch in use: **`feat/CI-CD`** on `git@github.com:khiem918/VideoPlatformServer.git`.

---

## Components

| Folder | What it is | Stack |
|---|---|---|
| `api_service/` | Main NestJS GraphQL API (formerly `Server/`) | NestJS 11, Apollo 5, Prisma 7, TypeORM, BullMQ, RabbitMQ, gRPC, FFmpeg |
| `search_service/` | Search & embedding microservice (formerly `Embed_Server/` + parts of `Server/src/{search,embed,semantic-processing,tag}`) | FastAPI 0.104, aio-pika, qdrant-client (fastembed), grpcio, redis, Prisma, dependency-injector |
| `proto/` | gRPC service contracts shared by the two services | Protocol Buffers v3 |
| `docker/` | Local infra: Postgres (×2), Redis, Qdrant, RabbitMQ | docker-compose |
| `r2-worker/` | Cloudflare Worker bridging uploads between client and R2 | Cloudflare Workers, Wrangler |
| `script/dev.sh` | Local dev helper (⚠️ still references old `Infra/` — needs update) | bash |
| `README.md` | This file | — |

### How they talk

- **Client → `api_service`**: GraphQL + REST (presigned uploads).
- **`api_service` → `search_service`**: RabbitMQ (metadata-transfer messages) and gRPC (`VideoMetaDataService.GetVideoMetaData`).
- **`api_service` → storage**: AWS S3 / Cloudflare R2 via `@aws-sdk/client-s3` (and via `r2-worker` for browser-direct uploads).
- **Search pipeline**: `api_service` publishes a metadata message → `search_service` consumes, normalizes, embeds (fastembed), upserts into Qdrant, and writes the result to a result queue. A DLQ consumer handles failures (max 3 retries).

---

## Tech stack

### `api_service/` (NestJS)

- NestJS 11, `@nestjs/graphql` 13, Apollo Server 5
- TypeScript 5, Jest
- Prisma 7 + `@prisma/adapter-pg` (PostgreSQL)
- TypeORM (`@nestjs/typeorm`)
- BullMQ + Redis (in-process queues for FFmpeg transcoding)
- RabbitMQ via `@golevelup/nestjs-rabbitmq` + `amqplib` (cross-service messaging)
- gRPC server via `@nestjs/microservices` + `@grpc/grpc-js` + `@grpc/proto-loader`
- Qdrant client: `@qdrant/js-client-rest`
- AWS S3: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`
- Auth: `passport-jwt`, `bcryptjs`, `firebase-admin` (Firebase ID tokens)
- FFmpeg: `fluent-ffmpeg`, `ffmpeg-static`, `ffprobe-static`
- Validation: `class-validator`, `class-transformer`

### `search_service/` (FastAPI)

- Python 3.10+
- FastAPI 0.104, Uvicorn 0.24, Pydantic v2
- `aio-pika` 9.4 (async RabbitMQ)
- `qdrant-client[fastembed]` 1.14+ (vector store + embedding model)
- `dependency-injector` 4.49 (DI container in `src/app/container.py`)
- `prisma` 0.15+ (search-domain Postgres)
- `grpcio` / `grpcio-tools` 1.68+ (gRPC client to `api_service`)
- `redis` 7.2 (metadata caching)
- `boto3` (S3 / R2)
- `python-jose` (JWT)

### `r2-worker/`

- Cloudflare Workers, Wrangler 4.x, Vitest

---

## Project structure (top-level)

```
VideoPlatformServer/
├── api_service/                   # NestJS GraphQL API
│   ├── prisma/                    # schema.prisma + migrations
│   ├── src/
│   │   ├── main.ts                # bootstrap (HTTPS, helmet, gRPC microservice, ...)
│   │   ├── app.module.ts
│   │   ├── auth/                  # JWT + Firebase
│   │   ├── video/                 # video domain (resolver, controller, service, dto, repository)
│   │   ├── video-processing/      # FFmpeg pipeline (BullMQ workers, exceptions, dto)
│   │   ├── rabbitmq/              # publisher + consumer
│   │   ├── grpc/                  # VideoMetaDataService server
│   │   ├── notification/          # real-time notifications (Redis pub/sub)
│   │   ├── qdrant/                # Qdrant client
│   │   ├── s3/                    # S3 / R2 helper
│   │   ├── prisma/                # Prisma service module
│   │   ├── queue/                 # BullMQ module registration
│   │   ├── common/filters/        # all-exceptions filter
│   │   └── config/                # env validation
│   └── test/                      # e2e + fixtures
│
├── search_service/                # Python FastAPI search service
│   ├── main.py                    # FastAPI app + lifespan (loads embedding, starts consumers)
│   ├── prisma/                    # search-domain schema + migrations
│   ├── requirements.txt
│   └── src/
│       ├── app/
│       │   ├── container.py       # DI container (singleton services)
│       │   ├── api/v1/            # REST routes (search)
│       │   └── worker/            # consumer.py + dlq_consumer.py
│       ├── core/                  # dependency, exception, security, schema
│       ├── domain/
│       │   ├── entity/            # base_embeding, schema, search_respone
│       │   └── service/           # search, normalize, metadata_process
│       └── infrastructure/
│           ├── database/          # postgres, qdrant
│           ├── grpc/              # grpc_client (talks to api_service)
│           ├── ml_model/          # embeding_model
│           ├── queue/             # rabbitmq
│           ├── redis/             # redis cache
│           ├── repository/        # tag_repository
│           └── s3/                # s3_client
│
├── proto/                         # gRPC service contracts
│   └── video_metadata.proto       # video.metadata.v1.VideoMetaDataService
│
├── docker/                        # Local infra (replaces old Infra/ folder)
│   ├── docker-compose.api-service.yml     # Postgres 5434, Redis 6379, Qdrant 6333/6334, RabbitMQ 5672/15672
│   └── docker-compose.search-service.yml  # Postgres 5438
│
├── r2-worker/                     # Cloudflare R2 worker
│
├── script/
│   └── dev.sh                     # ⚠️ references old Infra/ folder — needs update for the new layout
│
├── package.json                   # root: just wrangler for r2-worker
├── .gitignore
└── README.md
```

> **Removed in this refactor**: `Server/`, `Embed_Server/`, `Infra/`. Their responsibilities live in `api_service/`, `search_service/`, and `docker/` respectively.

---

## Local ports (after `docker compose up`)

| Service | Port | Container |
|---|---|---|
| Postgres (api_service) | 5434 | `video_platform_api_db` |
| Postgres (search_service) | 5438 | `video_platform_search_db` |
| Redis | 6379 | `video-platform-redis` |
| Qdrant HTTP / gRPC | 6333 / 6334 | `qdrant` |
| RabbitMQ AMQP / Mgmt UI | 5672 / 15672 | `video-platform-rabbitmq` |
| `api_service` gRPC | 50051 | (host) |
| `api_service` GraphQL/HTTP | 3000 | (host) |
| `search_service` HTTP | 8000 | (host) |

---

## Database schemas

Two Prisma schemas, one per service:

- **`api_service/prisma/schema.prisma`** — auth, users, videos, comments, subscriptions, notifications, watch history, likes, channels, etc.
- **`search_service/prisma/schema.prisma`** — search-domain entities (tags + minimal mirror of video metadata needed for ranking).

Key entities in `api_service`: User, Video, VideoUpload, VideoHashtag, Subscribe, WatchHistory, Comment, LikeVideo, ChannelNotification, SystemNotification.

---

## Getting started

### Prerequisites

- Node.js >= 18.x
- Python 3.10+
- Docker & Docker Compose
- npm or pnpm

### 1. Bring up infra

```bash
cd "sever code/VideoPlatformServer"
docker compose -f docker/docker-compose.api-service.yml up -d
docker compose -f docker/docker-compose.search-service.yml up -d
```

> `script/dev.sh` is currently a stub for the old layout — see the cleanup notes at the bottom of this README.

### 2. Run `api_service`

```bash
cd api_service
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

GraphQL Playground: <http://localhost:3000/graphql>
gRPC server: `localhost:50051` (service `video.metadata.v1.VideoMetaDataService`)

### 3. Run `search_service`

```bash
cd search_service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
prisma generate --schema=prisma/schema.prisma
prisma migrate deploy --schema=prisma/schema.prisma
python main.py
```

HTTP: <http://localhost:8000>

### 4. Run `r2-worker`

```bash
cd r2-worker
npm install
npm run dev
```

---

## Available commands

### `api_service/`

```bash
npm run dev              # nest start --watch
npm run build            # nest build
npm run start            # nest start
npm run start:prod       # node dist/main
npm run start:debug      # nest start --debug --watch

npm run lint             # eslint
npm run format           # prettier
npm run test             # jest unit
npm run test:watch
npm run test:cov
npm run test:e2e         # jest --config ./test/jest-e2e.json

npm run prisma:generate  # prisma generate
npm run prisma:migrate   # prisma migrate dev
```

### `r2-worker/`

```bash
npm run dev              # local development
npm run deploy           # deploy to Cloudflare
npm run test             # vitest
```

---

## Architecture

### High-level diagram

```
Client (React + Vite)
        │
        │ GraphQL / presigned URLs
        ▼
┌───────────────────────────┐         ┌────────────────┐
│  api_service (NestJS)     │ ──────▶ │  r2-worker     │
│  - GraphQL resolvers      │         └────────────────┘
│  - BullMQ workers         │
│  - Prisma (Postgres)      │ ─▶ Postgres :5434
│  - Qdrant client          │ ─▶ Qdrant :6333
│  - Redis pub/sub          │ ─▶ Redis :6379
│  - RabbitMQ publisher     │ ─▶ RabbitMQ :5672
│  - gRPC server            │ ─▶ :50051
└──────────────┬────────────┘
               │  RabbitMQ (metadata transfer)
               │  gRPC      (GetVideoMetaData)
               ▼
┌───────────────────────────┐
│  search_service (FastAPI) │
│  - Embedding (fastembed)  │ ─▶ Qdrant
│  - Search service         │ ─▶ Redis cache
│  - DLQ consumer           │ ─▶ RabbitMQ
│  - Prisma (search domain) │ ─▶ Postgres :5438
└───────────────────────────┘
```

### Data flow (video upload + indexing)

1. Client uploads video file via presigned URL to R2.
2. Client calls `api_service` GraphQL mutation to register the video.
3. `api_service` writes the video row in Postgres and enqueues a transcoding job (BullMQ).
4. After transcoding, `api_service` publishes a `metadata-transfer` message to RabbitMQ.
5. `search_service` consumes the message, normalizes the data, embeds the description with `fastembed`, and upserts the vector into Qdrant.
6. On search request, `search_service` queries Qdrant, caches results in Redis, and may fetch additional metadata from `api_service` over gRPC.
7. Failed messages are routed to a DLQ and retried up to 3 times.

---

## Key features

### Authentication
- JWT (`passport-jwt`) + Firebase ID tokens (`firebase-admin`)

### Video management
- Upload, metadata management, view count, comments, likes

### Search & discovery
- Semantic search via embeddings (Qdrant + fastembed)
- Hashtag indexing (in `search_service`)
- Watch history

### Notifications
- Real-time, channel + system notifications
- Redis pub/sub to push events to subscribed clients

### Storage
- AWS S3 / Cloudflare R2 with pre-signed URLs

### Async processing
- **In-process**: BullMQ for FFmpeg transcoding
- **Cross-service**: RabbitMQ for metadata transfer + DLQ retries

---

## Testing

```bash
# api_service
cd api_service
npm run test             # unit
npm run test:e2e         # e2e

# r2-worker
cd ../r2-worker
npm run test
```

---

## Known cleanup items

- `script/dev.sh` still references the old `Infra/` folder. It needs an update to launch `docker/docker-compose.api-service.yml` and `docker-compose.search-service.yml` (plus the two service processes).
- No root `.gitignore` excluding `agent set up/` is in place yet.

---

## License

UNLICENSED — internal project.
