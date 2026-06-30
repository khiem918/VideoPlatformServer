-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateTable
CREATE TABLE "core"."hashtag" (
    "id" TEXT NOT NULL,
    "normalized_tag" TEXT NOT NULL,
    "count" BIGINT NOT NULL DEFAULT 0,
    "isCanoncial" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hashtag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hashtag_normalized_tag_key" ON "core"."hashtag"("normalized_tag");

-- CreateIndex
CREATE INDEX "hashtag_count_idx" ON "core"."hashtag"("count" DESC);

-- CreateIndex
CREATE INDEX "hashtag_createdAt_idx" ON "core"."hashtag"("createdAt" DESC);
