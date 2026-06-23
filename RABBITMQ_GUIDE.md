# RabbitMQ Integration Guide — NestJS `Server` ↔ FastAPI `Embed_Server`

## 0. Current state (why we're doing this)

Today, `Server` (NestJS) talks to `Embed_Server` (FastAPI) **synchronously over HTTP**:

- `Server/src/semantic-processing/summarizeservice/summarize.client.ts` does a blocking `fetch()` to `POST /desc/summarize`.
- The same pattern is used (or will be used) for `POST /vector/generate` (embeddings).
- `Embed_Server` loads a `sentence-transformers` model and a summarization model — both are CPU/GPU-heavy and **slow** (hundreds of ms to seconds per call).
- `Server` already has an async job pipeline for video transcoding (`video-processing` module, BullMQ + Redis), but the AI calls (summarize/embed) are still synchronous HTTP calls that block whatever request triggered them (e.g. video upload finishing, or a worker job awaiting `summarizeClient.summarizeDescription(...)`).

### Problems this creates
1. **Coupling**: if `Embed_Server` is down or slow, `Server` requests hang or fail outright (no retry, no backpressure).
2. **No retries / no buffering**: a transient model error or restart loses the request.
3. **No backpressure**: if 50 videos are uploaded at once, `Server` fires 50 concurrent HTTP calls at a Python process that can typically only run a few inferences at a time (GIL + single model instance).
4. **No work distribution**: you can't easily run 3 GPU workers for `Embed_Server` and load-balance fairly across them — HTTP round-robin doesn't account for "this worker is busy with a 2s inference".

RabbitMQ fixes all four: it decouples publisher from consumer, queues survive consumer downtime, multiple consumers compete fairly for messages (round-robin + prefetch), and you get retry/dead-letter semantics for free.

---

## 1. Two integration patterns — pick one

There are two valid ways to use RabbitMQ here. They are **not mutually exclusive** — this guide implements **Pattern A** for the video pipeline (matches your existing async job model) and shows **Pattern B** as an option if you want a drop-in replacement for the current synchronous calls.

### Pattern A — Fire-and-forget jobs + result queue (recommended)
`Server` publishes a "please summarize/embed this" message and moves on. `Embed_Server` consumes it, does the work, and publishes a "here's the result" message to a **different** queue. `Server` has a separate consumer that picks up results and writes them to Postgres via Prisma.

```
Server (producer)                  RabbitMQ                      Embed_Server (consumer)
  |--- publish job ---------------> [ai.embedding.request] -----> consume, run model
  |                                                                       |
  |<-- consume result ------------- [ai.embedding.result]  <------ publish result
  |   (update Prisma)
```

This fits your existing architecture (BullMQ already does this *inside* Node; now you extend the same "queue, don't block" philosophy *across* services). The HTTP request that triggered the video upload returns immediately; the embedding/summary shows up in the DB a few hundred ms–seconds later, and your frontend can poll or get a websocket/notification (you already have a `notification` module) when it's ready.

### Pattern B — RPC (request/reply over RabbitMQ)
`Server` publishes a request and **awaits** a correlated reply on a temporary/exclusive queue, simulating a synchronous call but over AMQP instead of HTTP. This is a drop-in replacement for `summarize.client.ts`'s `fetch()` if you don't want to change the calling code's "await and get the answer" shape.

```
Server: publish to [ai.summarize.rpc] with correlationId + replyTo
Embed_Server: consume, process, publish reply to replyTo with same correlationId
Server: resolves the pending Promise matching correlationId
```

This guide implements Pattern A fully (Section 4–7) and gives Pattern B as a variant (Section 8) since it's less idiomatic for RabbitMQ (you lose a lot of the benefit — you're still blocking a caller) but is sometimes needed for "I need the answer in this HTTP response" endpoints.

---

## 2. RabbitMQ topology (the actual queue/exchange design)

We use **topic exchanges** so we can route by message type without hardcoding queue names everywhere, plus a **dead-letter exchange (DLX)** so poisoned/failed messages don't loop forever or get silently dropped.

```
Exchange: ai.processing (type: topic, durable)
  routing key "embedding.request"  -> queue: ai.embedding.request
  routing key "embedding.result"   -> queue: ai.embedding.result
  routing key "summarize.request"  -> queue: ai.summarize.request
  routing key "summarize.result"   -> queue: ai.summarize.result

Exchange: ai.processing.dlx (type: topic, durable)
  catches anything nacked/expired from the queues above
  routing key "#" -> queue: ai.processing.dead-letter
```

| Queue | Producer | Consumer | Purpose |
|---|---|---|---|
| `ai.embedding.request` | Server | Embed_Server | "generate embedding for this text" |
| `ai.embedding.result` | Embed_Server | Server | "here's the vector" |
| `ai.summarize.request` | Server | Embed_Server | "summarize this description" |
| `ai.summarize.result` | Embed_Server | Server | "here's the summary" |
| `ai.processing.dead-letter` | (DLX) | (ops/manual) | messages that failed repeatedly or expired |

Why one exchange with multiple routing keys instead of 4 separate exchanges? It keeps the topology in one place, lets you add a new message type later by just adding a binding, and lets you bind a monitoring/logging queue to `#` (all messages) without touching producers.

All queues are declared as:
- `durable: true` — survive broker restart.
- messages published with `persistent: true` delivery mode — survive broker restart.
- `x-dead-letter-exchange: ai.processing.dlx` — auto-forward failed messages.
- a per-queue TTL on requests (e.g. 5 minutes) so a request nobody ever processes (e.g. all consumers down) eventually dead-letters instead of growing the queue forever.

---

## 3. Infra: run RabbitMQ locally with Docker

Following the same pattern as your existing `Infra/Postgres`, `Infra/Redis`, `Infra/Qdrant`, create `Infra/RabbitMQ/docker-compose.yml`:

```yaml
services:
  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    container_name: video-platform-rabbitmq
    ports:
      - "5672:5672"   # AMQP protocol port (used by both services)
      - "15672:15672" # Management UI (http://localhost:15672)
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

Start it:
```bash
cd VideoPlatformServer/Infra/RabbitMQ
docker compose up -d
```

Open `http://localhost:15672` (login `video_platform` / `change_me_in_prod`) — this is the management UI where you'll watch queues fill/drain, inspect messages, and manually purge/requeue during development. Use a real secret manager for the password outside local dev.

---

## 4. Environment variables

**`Server/.env`** — add:
```
RABBITMQ_URL=amqp://video_platform:change_me_in_prod@localhost:5672
```

**`Embed_Server/.env`** — add:
```
RABBITMQ_URL=amqp://video_platform:change_me_in_prod@localhost:5672
```

Using a single `amqp://` connection URL (instead of separate host/port/user/pass like your `QUEUE_HOST`/`QUEUE_PORT` Redis config) keeps both services' connection code simpler since both AMQP client libraries accept a URL directly.

---

## 5. NestJS side (`Server`)

### 5.1 Install dependencies

```bash
cd VideoPlatformServer/Server
npm install @golevelup/nestjs-rabbitmq amqplib amqp-connection-manager
```

`@golevelup/nestjs-rabbitmq` is the de-facto standard NestJS RabbitMQ wrapper (more capable than the built-in `@nestjs/microservices` Rabbit transport — it supports topic exchanges, RPC, and lets you keep using regular DI-based providers with decorators instead of a separate microservice context).

### 5.2 Create the RabbitMQ module

`Server/src/rabbitmq/rabbitmq.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

export const AI_EXCHANGE = 'ai.processing';
export const AI_DLX_EXCHANGE = 'ai.processing.dlx';

@Module({
  imports: [
    RabbitMQModule.forRootAsync(RabbitMQModule, {
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('RABBITMQ_URL'),
        exchanges: [
          { name: AI_EXCHANGE, type: 'topic' },
          { name: AI_DLX_EXCHANGE, type: 'topic' },
        ],
        connectionInitOptions: { wait: true },
        // reconnect automatically if RabbitMQ restarts
        reconnectTimeInSeconds: 5,
      }),
    }),
  ],
  exports: [RabbitMQModule],
})
export class RabbitmqModule {}
```

Note: `Server` already has a `src/queue` folder for BullMQ — keep them separate. `queue/` = intra-Node job queue (transcoding). `rabbitmq/` = cross-service message bus (AI calls). Don't merge these; they solve different problems.

### 5.3 Declare queues with DLX + TTL (once, at startup)

Add this to the same module's `useFactory`, or do it via a one-time setup script. The cleanest way with `@golevelup/nestjs-rabbitmq` is to declare queues as part of the module config:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

export const AI_EXCHANGE = 'ai.processing';
export const AI_DLX_EXCHANGE = 'ai.processing.dlx';

const REQUEST_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Module({
  imports: [
    RabbitMQModule.forRootAsync(RabbitMQModule, {
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('RABBITMQ_URL'),
        exchanges: [
          { name: AI_EXCHANGE, type: 'topic' },
          { name: AI_DLX_EXCHANGE, type: 'topic' },
        ],
        queues: [
          {
            name: 'ai.embedding.request',
            exchange: AI_EXCHANGE,
            routingKey: 'embedding.request',
            options: {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': AI_DLX_EXCHANGE,
                'x-dead-letter-routing-key': 'embedding.request',
                'x-message-ttl': REQUEST_TTL_MS,
              },
            },
          },
          {
            name: 'ai.embedding.result',
            exchange: AI_EXCHANGE,
            routingKey: 'embedding.result',
            options: { durable: true },
          },
          {
            name: 'ai.summarize.request',
            exchange: AI_EXCHANGE,
            routingKey: 'summarize.request',
            options: {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': AI_DLX_EXCHANGE,
                'x-dead-letter-routing-key': 'summarize.request',
                'x-message-ttl': REQUEST_TTL_MS,
              },
            },
          },
          {
            name: 'ai.summarize.result',
            exchange: AI_EXCHANGE,
            routingKey: 'summarize.result',
            options: { durable: true },
          },
          {
            name: 'ai.processing.dead-letter',
            exchange: AI_DLX_EXCHANGE,
            routingKey: '#',
            options: { durable: true },
          },
        ],
        connectionInitOptions: { wait: true },
        reconnectTimeInSeconds: 5,
      }),
    }),
  ],
  exports: [RabbitMQModule],
})
export class RabbitmqModule {}
```

This declares every queue/exchange/binding from Section 2 idempotently on app startup — no manual `rabbitmqadmin` step needed, and if you wipe the RabbitMQ container, restarting `Server` recreates the topology.

### 5.4 Define shared message shapes

`Server/src/rabbitmq/dto/ai-messages.dto.ts`:
```ts
export interface EmbeddingRequestMessage {
  jobId: string;       // correlates request -> result, e.g. videoId or a uuid
  videoId: string;
  textToEmbed: string;
  isQuery: boolean;
}

export interface EmbeddingResultMessage {
  jobId: string;
  videoId: string;
  vector: number[];
  error?: string;       // present if Embed_Server failed processing
}

export interface SummarizeRequestMessage {
  jobId: string;
  videoId: string;
  text: string;
}

export interface SummarizeResultMessage {
  jobId: string;
  videoId: string;
  summary: string;
  error?: string;
}
```

`jobId` is what lets the result consumer match a result back to the original request without keeping any in-memory state — it's just a UUID (or reuse `videoId` if at most one in-flight job per video at a time).

### 5.5 Publisher service (replaces `summarize.client.ts` HTTP call)

`Server/src/rabbitmq/ai-publisher.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { randomUUID } from 'crypto';
import { AI_EXCHANGE } from './rabbitmq.module';
import {
  EmbeddingRequestMessage,
  SummarizeRequestMessage,
} from './dto/ai-messages.dto';

@Injectable()
export class AiPublisherService {
  constructor(private readonly amqpConnection: AmqpConnection) {}

  async requestSummary(videoId: string, text: string): Promise<string> {
    const jobId = randomUUID();
    const message: SummarizeRequestMessage = { jobId, videoId, text };

    await this.amqpConnection.publish(AI_EXCHANGE, 'summarize.request', message, {
      persistent: true,
    });

    return jobId;
  }

  async requestEmbedding(
    videoId: string,
    textToEmbed: string,
    isQuery: boolean,
  ): Promise<string> {
    const jobId = randomUUID();
    const message: EmbeddingRequestMessage = {
      jobId,
      videoId,
      textToEmbed,
      isQuery,
    };

    await this.amqpConnection.publish(AI_EXCHANGE, 'embedding.request', message, {
      persistent: true,
    });

    return jobId;
  }
}
```

`publish` here is **fire-and-forget** — it returns once the broker has accepted the message, not once it's processed. That's the whole point of Pattern A: the caller (e.g. your video-upload handler) gets a `jobId` back immediately and moves on.

### 5.6 Consumer service (handles results, writes to Prisma)

`Server/src/rabbitmq/ai-result-consumer.service.ts`:
```ts
import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  EmbeddingResultMessage,
  SummarizeResultMessage,
} from './dto/ai-messages.dto';

@Injectable()
export class AiResultConsumerService {
  private readonly logger = new Logger(AiResultConsumerService.name);

  constructor(private readonly prisma: PrismaService) {}

  @RabbitSubscribe({
    exchange: 'ai.processing',
    routingKey: 'embedding.result',
    queue: 'ai.embedding.result',
  })
  async handleEmbeddingResult(message: EmbeddingResultMessage) {
    if (message.error) {
      this.logger.error(
        `Embedding job ${message.jobId} failed: ${message.error}`,
      );
      return; // not requeued — this is the *result* queue, the request already succeeded/failed terminally
    }

    await this.prisma.video.update({
      where: { id: message.videoId },
      data: { embedding: message.vector },
    });

    this.logger.log(`Stored embedding for video ${message.videoId}`);
  }

  @RabbitSubscribe({
    exchange: 'ai.processing',
    routingKey: 'summarize.result',
    queue: 'ai.summarize.result',
  })
  async handleSummarizeResult(message: SummarizeResultMessage) {
    if (message.error) {
      this.logger.error(
        `Summarize job ${message.jobId} failed: ${message.error}`,
      );
      return;
    }

    await this.prisma.video.update({
      where: { id: message.videoId },
      data: { description: message.summary },
    });

    this.logger.log(`Stored summary for video ${message.videoId}`);
  }
}
```

Adjust field names (`embedding`, `description`) to whatever your actual `prisma/schema.prisma` `Video` model calls these columns — check that before wiring this in.

By default, `@golevelup/nestjs-rabbitmq` acks the message automatically when the handler resolves without throwing, and **nacks (requeues to DLX after retries)** if the handler throws. So if `prisma.video.update` throws (e.g. DB hiccup), the message dead-letters instead of silently vanishing — check `ai.processing.dead-letter` periodically (or set up an alert) during development.

### 5.7 Wire it into the module that needs it

```ts
@Module({
  imports: [RabbitmqModule],
  providers: [AiPublisherService, AiResultConsumerService],
  exports: [AiPublisherService],
})
export class SemanticProcessingModule { /* ... */ }
```

Then anywhere you previously had:
```ts
const summary = await this.summarizeClient.summarizeDescription(text);
```
you now have:
```ts
const jobId = await this.aiPublisher.requestSummary(videoId, text);
// returns immediately; summary lands in DB asynchronously via AiResultConsumerService
```

This is the one real behavior change calling code must absorb: **you no longer get the answer in the same call**. If a caller genuinely needs the result before responding to its own caller (e.g. a GraphQL mutation that must return the summary inline), use Pattern B (Section 8) for that specific call instead of forcing everything through Pattern A.

---

## 6. FastAPI side (`Embed_Server`)

### 6.1 Install dependencies

```bash
cd VideoPlatformServer/Embed_Server
pip install aio-pika
```
Add to `requirements.txt`:
```
aio-pika==9.4.3
```

`aio-pika` is the standard asyncio-native AMQP client for Python and integrates cleanly with FastAPI's async event loop (unlike `pika`, which is sync/blocking).

### 6.2 Connection + topology setup

`Embed_Server/app/rabbitmq.py`:
```python
import os
import aio_pika

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672")

AI_EXCHANGE = "ai.processing"
AI_DLX_EXCHANGE = "ai.processing.dlx"
REQUEST_TTL_MS = 5 * 60 * 1000


async def get_connection() -> aio_pika.RobustConnection:
    # RobustConnection auto-reconnects if RabbitMQ restarts or the network blips
    return await aio_pika.connect_robust(RABBITMQ_URL)


async def declare_topology(channel: aio_pika.RobustChannel):
    exchange = await channel.declare_exchange(
        AI_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
    )
    dlx_exchange = await channel.declare_exchange(
        AI_DLX_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
    )

    embedding_request_q = await channel.declare_queue(
        "ai.embedding.request",
        durable=True,
        arguments={
            "x-dead-letter-exchange": AI_DLX_EXCHANGE,
            "x-dead-letter-routing-key": "embedding.request",
            "x-message-ttl": REQUEST_TTL_MS,
        },
    )
    await embedding_request_q.bind(exchange, routing_key="embedding.request")

    summarize_request_q = await channel.declare_queue(
        "ai.summarize.request",
        durable=True,
        arguments={
            "x-dead-letter-exchange": AI_DLX_EXCHANGE,
            "x-dead-letter-routing-key": "summarize.request",
            "x-message-ttl": REQUEST_TTL_MS,
        },
    )
    await summarize_request_q.bind(exchange, routing_key="summarize.request")

    dead_letter_q = await channel.declare_queue("ai.processing.dead-letter", durable=True)
    await dead_letter_q.bind(dlx_exchange, routing_key="#")

    return exchange, embedding_request_q, summarize_request_q
```

Both services declare the same topology defensively (idempotent — `declare_*` is a no-op if it already exists with matching arguments). This means either service can start first without errors.

### 6.3 Consumer + result publisher

`Embed_Server/app/rabbitmq_consumer.py`:
```python
import json
import logging
import aio_pika
from service.embedding_model import EmbeddingService
from service.summarization_model import SummarizationService
from rabbitmq import get_connection, declare_topology, AI_EXCHANGE

logger = logging.getLogger(__name__)

PREFETCH_COUNT = 4  # max concurrent unacked messages per consumer; tune to your model's real concurrency


async def handle_embedding_request(
    message: aio_pika.IncomingMessage,
    exchange: aio_pika.Exchange,
    embedding_service: EmbeddingService,
):
    async with message.process(requeue=False):
        # requeue=False: on exception, message goes to DLX instead of looping
        # back into this same queue forever (which would just fail again).
        payload = json.loads(message.body)
        job_id = payload["jobId"]
        video_id = payload["videoId"]

        try:
            prefix = "query: " if payload["isQuery"] else "passage: "
            text = f"{prefix}{payload['textToEmbed']}"
            vector = embedding_service.generate_embedding(text)
            result = {"jobId": job_id, "videoId": video_id, "vector": vector}
        except Exception as exc:
            logger.exception("Embedding job %s failed", job_id)
            result = {"jobId": job_id, "videoId": video_id, "vector": [], "error": str(exc)}

        await exchange.publish(
            aio_pika.Message(
                body=json.dumps(result).encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                content_type="application/json",
            ),
            routing_key="embedding.result",
        )


async def handle_summarize_request(
    message: aio_pika.IncomingMessage,
    exchange: aio_pika.Exchange,
    summarization_service: SummarizationService,
):
    async with message.process(requeue=False):
        payload = json.loads(message.body)
        job_id = payload["jobId"]
        video_id = payload["videoId"]

        try:
            summary = summarization_service.summarize(payload["text"])
            result = {"jobId": job_id, "videoId": video_id, "summary": summary}
        except Exception as exc:
            logger.exception("Summarize job %s failed", job_id)
            result = {"jobId": job_id, "videoId": video_id, "summary": "", "error": str(exc)}

        await exchange.publish(
            aio_pika.Message(
                body=json.dumps(result).encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                content_type="application/json",
            ),
            routing_key="summarize.result",
        )


async def start_consumers(embedding_service: EmbeddingService, summarization_service: SummarizationService):
    connection = await get_connection()
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=PREFETCH_COUNT)

    exchange, embedding_q, summarize_q = await declare_topology(channel)

    await embedding_q.consume(
        lambda msg: handle_embedding_request(msg, exchange, embedding_service)
    )
    await summarize_q.consume(
        lambda msg: handle_summarize_request(msg, exchange, summarization_service)
    )

    logger.info("RabbitMQ consumers started (prefetch=%d)", PREFETCH_COUNT)
    return connection
```

`set_qos(prefetch_count=4)` caps how many messages this consumer pulls before acking — without it, RabbitMQ pushes the *entire* queue at once to a single consumer with unlimited buffering, which defeats fair dispatch if you later run multiple `Embed_Server` replicas. Set this close to the number of inferences your process can genuinely run concurrently (often low, since the model is shared and Python's GIL serializes CPU-bound work — start at 1-2 if unsure and raise based on measured throughput).

`message.process(requeue=False)` is an `aio-pika` context manager: ack on success, **reject without requeue** on exception. Since the queue has `x-dead-letter-exchange` configured, a rejected message routes to the DLX automatically instead of being dropped — you get a record of what failed instead of silent data loss.

### 6.4 Wire into FastAPI startup/shutdown

`Embed_Server/app/main.py` — add:
```python
from contextlib import asynccontextmanager
from rabbitmq_consumer import start_consumers

@asynccontextmanager
async def lifespan(app: FastAPI):
    connection = await start_consumers(embedding_service, summarization_service)
    yield
    await connection.close()

app = FastAPI(title="Video Platform AI Service", lifespan=lifespan)
```

This starts consuming from RabbitMQ as soon as the FastAPI process boots (alongside, not instead of, the existing HTTP routes — see Section 9 on migration), and cleanly closes the AMQP connection on shutdown.

---

## 7. Running and verifying end-to-end

1. `cd Infra/RabbitMQ && docker compose up -d`
2. `cd Server && npm run start:dev`
3. `cd Embed_Server && uvicorn app.main:app --reload --port 8090`
4. Trigger a summarize call from `Server` (call `aiPublisher.requestSummary(...)` from a test endpoint or existing flow).
5. Watch it happen in the management UI (`http://localhost:15672` → Queues tab):
   - `ai.summarize.request` depth briefly goes to 1, then back to 0 (consumed).
   - `ai.summarize.result` depth briefly goes to 1, then back to 0 (consumed by `Server`).
6. Confirm the `Video` row's `description` was updated in Postgres.
7. Kill `Embed_Server` (`Ctrl+C`), trigger another summarize call, confirm the message sits in `ai.summarize.request` (visible in the UI) instead of erroring out — then restart `Embed_Server` and watch it drain the backlog. This is the core benefit of the broker: a dead consumer doesn't lose work.

---

## 8. Pattern B variant — RPC (only if you need a synchronous answer)

If some call site truly needs the result inline (e.g. a GraphQL resolver that must return the embedding in its response), `@golevelup/nestjs-rabbitmq` supports RPC directly without you managing correlation IDs by hand:

**Embed_Server side** — same consumer pattern as Section 6.3, except instead of publishing to a separate result queue, reply directly to `message.reply_to` with `message.correlation_id`:
```python
async def handle_summarize_rpc(message: aio_pika.IncomingMessage, summarization_service):
    async with message.process(requeue=False):
        payload = json.loads(message.body)
        summary = summarization_service.summarize(payload["text"])

        await message.channel.default_exchange.publish(
            aio_pika.Message(
                body=json.dumps({"summary": summary}).encode(),
                correlation_id=message.correlation_id,
            ),
            routing_key=message.reply_to,
        )
```

**Server side**:
```ts
const response = await this.amqpConnection.request<{ summary: string }>({
  exchange: AI_EXCHANGE,
  routingKey: 'summarize.rpc',
  payload: { text },
  timeout: 10000, // ms — RPC must have a timeout, unlike fire-and-forget
});
```

Use this sparingly. Every RPC call still blocks the caller for as long as the model takes to run — you've just swapped HTTP for AMQP as the transport, without gaining the backpressure/retry benefits Pattern A gives you, because the caller has no work to do while waiting either way. Prefer Pattern A and adjust the calling code (or frontend) to be eventually-consistent instead of reaching for RPC out of convenience.

---

## 9. Migration plan (don't do a big-bang cutover)

1. **Add, don't remove**: deploy the RabbitMQ consumer/publisher code alongside the existing HTTP routes in `Embed_Server` — don't delete `/desc/summarize` or `/vector/generate` yet.
2. **Dual-write verification**: for one call site (e.g. summarization in the video upload flow), switch `Server` to publish via RabbitMQ instead of `fetch()`, but keep the HTTP client code in the repo behind a feature flag/env var (`USE_RABBITMQ_AI=true`) for a quick rollback path.
3. **Watch the DLX** (`ai.processing.dead-letter`) during this period — anything landing there means a bug in message shape or a consumer crash, not a customer-visible 500, so you have time to fix it.
4. **Repeat for embeddings.**
5. Once both are stable in RabbitMQ for a deployment cycle, delete `summarize.client.ts`'s HTTP path and the now-unused FastAPI HTTP routes (or keep `/health` for container orchestration liveness checks — that one should stay regardless).

---

## 10. Production hardening checklist

- [ ] Run RabbitMQ as a 3-node cluster (or use a managed service) — a single-node broker is a SPOF for *all* AI processing once you cut over.
- [ ] Set real credentials via secrets manager, not `.env` committed to git.
- [ ] Add `connectionInitOptions: { wait: true }` (already in Section 5.2) so `Server` doesn't start serving traffic before it can reach RabbitMQ — fail fast on boot instead of silently dropping early messages.
- [ ] Add a small dashboard/alert on `ai.processing.dead-letter` queue depth (e.g. Prometheus `rabbitmq_queue_messages` exported by the `management` image, alert if > 0 for 10+ minutes).
- [ ] Decide a replay strategy for dead-lettered messages (manual `rabbitmqadmin` republish, or a small admin script) before you need it under pressure.
- [ ] If you scale `Embed_Server` to multiple replicas, re-check `PREFETCH_COUNT` — RabbitMQ round-robins per-message across all consumers on a queue, so this is also your load-balancing knob.
