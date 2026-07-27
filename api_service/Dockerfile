# Multi-stage build for the NestJS/GraphQL API service. Debian-slim (not
# alpine) because ffmpeg-static/ffprobe-static ship glibc-linked binaries
# that do not run against musl.
#
# GRPC_PROTO_PATH (src/grpc/constants.ts) resolves "../proto/video.proto"
# relative to cwd, so the proto file must land as a sibling of the app
# directory in the image -- build this from the repo root as context:
#   docker build -f api_service/Dockerfile ..  (see docker-compose.staging.yml)

FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY api_service/package.json api_service/package-lock.json ./
RUN npm ci

COPY api_service/. .
COPY proto /proto
RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV CHECKPOINT_DISABLE=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

COPY api_service/package.json api_service/package-lock.json ./
# `@prisma/client` (imported directly by prisma.service.ts) is listed under
# devDependencies in package.json despite being required at runtime, so
# `--omit=dev` would silently strip it and break every DB-touching path.
RUN npm ci

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /proto /proto

# GraphQLModule's autoSchemaFile writes src/schema.gql relative to cwd at
# boot; the compiled runtime image only ships dist/, so the directory has
# to exist for that write to succeed.
RUN mkdir -p src

EXPOSE 8080 50051

CMD ["node", "dist/main"]
