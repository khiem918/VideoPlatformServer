-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "test";

-- CreateTable
CREATE TABLE "test"."VideoTest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "desc" TEXT NOT NULL,

    CONSTRAINT "VideoTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hashtag_count_idx" ON "hashtag"("count" DESC);

-- CreateIndex
CREATE INDEX "hashtag_createdAt_idx" ON "hashtag"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "subscribe_channel_id_idx" ON "subscribe"("channel_id");

-- CreateIndex
CREATE INDEX "user_user_name_idx" ON "user"("user_name");

-- CreateIndex
CREATE INDEX "video_user_owner_idx" ON "video"("user_owner");

-- CreateIndex
CREATE INDEX "video_video_visibility_idx" ON "video"("video_visibility");

-- CreateIndex
CREATE INDEX "video_createdAt_idx" ON "video"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "video_hashtag_hashtag_id_idx" ON "video_hashtag"("hashtag_id");

-- CreateIndex
CREATE INDEX "video_processing_status_idx" ON "video_processing"("status");

-- CreateIndex
CREATE INDEX "video_processing_createdAt_idx" ON "video_processing"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "video_upload_userId_idx" ON "video_upload"("userId");

-- CreateIndex
CREATE INDEX "video_upload_status_idx" ON "video_upload"("status");

-- CreateIndex
CREATE INDEX "video_upload_createdAt_idx" ON "video_upload"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "watch_history_video_id_idx" ON "watch_history"("video_id");
