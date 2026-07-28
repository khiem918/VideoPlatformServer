# ---- Stage 1: build ----
FROM public.ecr.aws/docker/library/node:18-alpine AS builder

WORKDIR /app

# Install OS deps needed by Prisma
RUN apk add --no-cache openssl

# Copy package files first for better layer caching
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Install ALL deps (including devDeps) for build
RUN npm install

# Generate Prisma Client
RUN npx prisma generate

# Copy source and build
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src ./src
RUN npm run build

# Prune devDependencies for production image
RUN npm prune --omit=dev

# ---- Stage 2: runtime ----
FROM public.ecr.aws/docker/library/node:18-alpine AS runtime

WORKDIR /app

# Install OS deps needed at runtime (Prisma + FFmpeg + OpenSSL)
RUN apk add --no-cache openssl ffmpeg

# Copy production artifacts from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

# Use entrypoint to run migrations, then start app
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start:prod"]
