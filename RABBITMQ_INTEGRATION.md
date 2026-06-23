# RabbitMQ communication between NestJS and FastAPI

## Why

`Server` (NestJS) previously called `Embed_Server` (FastAPI) over plain HTTP
(`fetch`) for two operations: generating embedding vectors and summarizing
video descriptions. That coupling means:

- Nest blocks on a synchronous HTTP round-trip while a GPU-bound model runs.
- If `Embed_Server` is briefly unavailable, the call fails immediately —
  there's no queueing/retry at the transport level.
- Both sides need to agree on host/port/API-key wiring instead of a single
  broker URL.

Swapping the transport for RabbitMQ keeps the same request/response shape
the calling code expects (`generateVector`, `summarizeDescription` still
return a `Promise`), but the calls now go through a broker that buffers
messages, can be inspected via the management UI, and works the same way
for any other consumer we add later (a second Python worker, a queue
inspector, etc.).

## Pattern: RPC over RabbitMQ ("direct reply-to")

This is the standard RabbitMQ RPC tutorial pattern (tutorial 6), not the
`@nestjs/microservices` RMQ transport. Reasons:

- It's plain AMQP — same protocol semantics on both the Node and Python
  side, no NestJS-internal wire format to replicate in Python.
- One reusable client (`RabbitMqService`) handles every RPC call we have
  today and any future one — adding a new request type is just "give it a
  queue name."

Flow for a single call (e.g. `generateVector`):

```
NestJS (caller)                         RabbitMQ                    FastAPI (worker)
   |--- declare exclusive reply queue ----->|
   |--- publish to "rpc_vector_generate" -->|--- delivers ------------->|
   |    properties: correlationId, replyTo  |                          | runs embedding model
   |                                         |<--- publish reply -------|
   |<--- delivers to reply queue ------------|    properties: correlationId
   | match correlationId -> resolve Promise |
```

- **Request queue**: a well-known, durable queue name (`rpc_vector_generate`,
  `rpc_desc_summarize`). FastAPI declares and consumes from it.
- **Reply queue**: each NestJS process owns one exclusive, auto-delete queue
  (created once on boot), reused for every outgoing RPC call it makes.
- **Correlation**: NestJS generates a `correlationId` (UUID) per call and
  keeps an in-memory `Map<correlationId, {resolve, reject}>`. When a reply
  arrives on the reply queue, it's matched back to the right `Promise` and
  the entry is removed. A timeout rejects the promise if nothing comes
  back in time (default 15s).
- **Message body**: plain JSON. Replies are wrapped as
  `{ success: true, data }` or `{ success: false, error }` so the client
  can turn a worker-side exception into a rejected Promise.

## NestJS side

### `Server/src/rabbitmq/rabbitmq.service.ts`

Generic RPC client, `@Global()`-scoped via `RabbitMqModule` so any feature
module can inject it without re-importing wiring:

```ts
async request<TResponse>(queueName: string, payload: unknown, timeoutMs = 15000): Promise<TResponse>
```

It connects with `amqp-connection-manager` (auto-reconnects, re-asserts the
reply queue on reconnect), asserts one exclusive reply queue per process,
and resolves/rejects pending requests as replies come in.

### `Server/src/rabbitmq/rabbitmq.queues.ts`

```ts
export const RABBITMQ_QUEUES = {
  VECTOR_GENERATE: 'rpc_vector_generate',
  DESC_SUMMARIZE: 'rpc_desc_summarize',
} as const;
```

Single source of truth for queue names on the Node side — the Python
consumer hardcodes the same two strings, so if you rename one, update both.

### Call sites — unchanged signatures, new transport

`Server/src/embed/embedservice/embed.client.ts` and
`Server/src/semantic-processing/summarizeservice/summarize.client.ts` no
longer build `fetch()` requests; they call
`this.rabbitMqService.request(QUEUE_NAME, payload)` instead. Every caller
of `EmbedClient`/`SummarizeClient` (e.g. `EmbedService.processEmbed`,
`SemanticProcessingService.summarizeDescription`) is untouched — they still
just `await` a normal method.

### Config

`RABBITMQ_URL` is now a required env var (`Server/src/config/env.validation.ts`),
defaulted in `Server/.env` to:

```
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

## FastAPI side

### `Embed_Server/app/rabbitmq_consumer.py`

`RabbitMqRpcConsumer` connects with `aio_pika.connect_robust`, declares the
same two durable queues, and registers one handler per queue:

- `_handle_vector_generate` — accepts a single object or a list (mirrors the
  old `Union[TagProcessRequest, List[TagProcessRequest]]` endpoint),
  prefixes text with `"query: "`/`"passage: "` exactly as before, and calls
  `EmbeddingService.generate_embedding`.
- `_handle_summarize` — calls `SummarizationService.summarize`.

Both wrap their result as `{"success": True, "data": ...}` or
`{"success": False, "error": str(exc)}` and publish it to `message.reply_to`
with `correlation_id=message.correlation_id` via the channel's default
exchange (the standard way to publish straight to a queue by name in AMQP).

`channel.set_qos(prefetch_count=10)` caps how many unacked messages a
worker holds at once, so one slow embedding call doesn't starve the others
queued behind it once you scale to multiple `Embed_Server` replicas.

### `Embed_Server/app/main.py`

The HTTP routes `/vector/generate` and `/desc/summarize` (and the API-key
header check) are gone — that's the surface RabbitMQ replaces. `/health`
stays as a plain liveness probe. A FastAPI `lifespan` context starts the
consumer on boot and closes the connection on shutdown:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    await rabbitmq_consumer.start()
    yield
    await rabbitmq_consumer.stop()

app = FastAPI(title="Video Platform AI Service", lifespan=lifespan)
```

### Dependency

`aio-pika==9.4.3` added to `Embed_Server/requirements.txt`.

## Infra

`Infra/docker-compose.api-service.yml` gains a `rabbitmq` service
(`rabbitmq:3.13-management-alpine`), exposing:

- `5672` — AMQP (what both apps connect to)
- `15672` — management UI, `http://localhost:15672`, default `guest`/`guest`

## Running it locally

```bash
docker compose -f Infra/docker-compose.api-service.yml up -d rabbitmq

# FastAPI worker
cd Embed_Server && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# NestJS API
cd Server
npm run start:dev
```

Trigger an embed job (e.g. create/update a video so `EmbedService.processEmbed`
runs) and watch both logs: Nest logs `Connected to RabbitMQ` on boot, and
`Embed_Server` logs `RabbitMQ RPC consumer started, listening on
'rpc_vector_generate' and 'rpc_desc_summarize'`. You can also watch message
flow live in the management UI's **Queues** tab.

## Extending this

To add a third RPC call (say, a tagging service):

1. Add a queue name to `RABBITMQ_QUEUES` in `rabbitmq.queues.ts`.
2. Call `rabbitMqService.request(RABBITMQ_QUEUES.NEW_THING, payload)` from
   wherever needs it — no new module wiring required, `RabbitMqService` is
   global.
3. Declare the same queue name in `rabbitmq_consumer.py`, add a handler,
   and `consume()` it in `start()`.

No changes needed to the broker itself — queues are declared on demand by
whichever side starts first.
