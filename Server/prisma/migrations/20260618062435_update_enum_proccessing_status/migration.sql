-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateEnum
CREATE TYPE "core"."UploadStatus" AS ENUM ('PENDING', 'UPLOADED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "core"."ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "core"."VideoVisibility" AS ENUM ('DRAFT', 'PUBLISHED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "core"."VideoFail" AS ENUM ('Vectorlize', 'Process');

-- CreateEnum
CREATE TYPE "core"."Resolution" AS ENUM ('x360p', 'x480p', 'x720p', 'x1080p', 'x1440p', 'x2160p');

-- CreateTable
CREATE TABLE "core"."user" (
    "id" TEXT NOT NULL,
    "user_name" VARCHAR(30),
    "user_email" VARCHAR(320) NOT NULL,
    "channel_intro" VARCHAR(1000),
    "subscribe_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."hashtag" (
    "id" TEXT NOT NULL,
    "normalized_tag" TEXT NOT NULL,
    "count" BIGINT NOT NULL DEFAULT 0,
    "isCanoncial" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hashtag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."video_hashtag" (
    "video_id" TEXT NOT NULL,
    "hashtag_id" TEXT NOT NULL,
    "display_tag" TEXT NOT NULL,

    CONSTRAINT "video_hashtag_pkey" PRIMARY KEY ("video_id","hashtag_id")
);

-- CreateTable
CREATE TABLE "core"."subscribe" (
    "user_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "nofify_subscribe" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subscribe_pkey" PRIMARY KEY ("user_id","channel_id")
);

-- CreateTable
CREATE TABLE "core"."watch_history" (
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "paused_at" INTEGER NOT NULL DEFAULT 0,
    "watched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_history_pkey" PRIMARY KEY ("user_id","video_id")
);

-- CreateTable
CREATE TABLE "core"."video" (
    "id" TEXT NOT NULL,
    "video_name" VARCHAR(1000) NOT NULL DEFAULT 'draft',
    "video_released_date" TIMESTAMP(6),
    "video_view" BIGINT NOT NULL DEFAULT 0,
    "video_like" INTEGER NOT NULL DEFAULT 0,
    "video_dislike" INTEGER NOT NULL DEFAULT 0,
    "user_owner" TEXT NOT NULL,
    "video_url_storage" VARCHAR(1000),
    "thumbnail_url" TEXT,
    "upload_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "video_visibility" "core"."VideoVisibility" NOT NULL DEFAULT 'DRAFT',
    "duration" INTEGER NOT NULL DEFAULT 0,
    "videoDesc" TEXT,
    "rawDesc" TEXT,

    CONSTRAINT "video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."like_video" (
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "isLike" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "like_video_pkey" PRIMARY KEY ("userId","videoId")
);

-- CreateTable
CREATE TABLE "core"."video_processing" (
    "id" TEXT NOT NULL,
    "videoUploadId" TEXT NOT NULL,
    "status" "core"."ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "PlaylistPath" TEXT,
    "thumbnailPath" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_processing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."video_upload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "r2Path" TEXT NOT NULL,
    "status" "core"."UploadStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "processingJobId" TEXT,
    "thumbnail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."Comment" (
    "id" BIGINT NOT NULL,
    "videoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" BIGINT,
    "content" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."channel_notification" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notification_subject" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "channel_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."system_notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notification_subject" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "system_notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_user_email_key" ON "core"."user"("user_email");

-- CreateIndex
CREATE INDEX "user_user_name_idx" ON "core"."user"("user_name");

-- CreateIndex
CREATE UNIQUE INDEX "hashtag_normalized_tag_key" ON "core"."hashtag"("normalized_tag");

-- CreateIndex
CREATE INDEX "hashtag_count_idx" ON "core"."hashtag"("count" DESC);

-- CreateIndex
CREATE INDEX "hashtag_createdAt_idx" ON "core"."hashtag"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "video_hashtag_hashtag_id_idx" ON "core"."video_hashtag"("hashtag_id");

-- CreateIndex
CREATE INDEX "subscribe_channel_id_idx" ON "core"."subscribe"("channel_id");

-- CreateIndex
CREATE INDEX "watch_history_video_id_idx" ON "core"."watch_history"("video_id");

-- CreateIndex
CREATE INDEX "watch_history_user_id_watched_at_idx" ON "core"."watch_history"("user_id", "watched_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "video_upload_id_key" ON "core"."video"("upload_id");

-- CreateIndex
CREATE INDEX "video_user_owner_idx" ON "core"."video"("user_owner");

-- CreateIndex
CREATE INDEX "video_createdAt_idx" ON "core"."video"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "video_video_visibility_createdAt_idx" ON "core"."video"("video_visibility", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "video_video_visibility_video_view_idx" ON "core"."video"("video_visibility", "video_view" DESC);

-- CreateIndex
CREATE INDEX "video_video_released_date_idx" ON "core"."video"("video_released_date" DESC);

-- CreateIndex
CREATE INDEX "like_video_videoId_idx" ON "core"."like_video"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "video_processing_videoUploadId_key" ON "core"."video_processing"("videoUploadId");

-- CreateIndex
CREATE INDEX "video_processing_createdAt_idx" ON "core"."video_processing"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "video_processing_status_createdAt_idx" ON "core"."video_processing"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "video_upload_r2Path_key" ON "core"."video_upload"("r2Path");

-- CreateIndex
CREATE INDEX "video_upload_status_idx" ON "core"."video_upload"("status");

-- CreateIndex
CREATE INDEX "video_upload_createdAt_idx" ON "core"."video_upload"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "video_upload_userId_status_idx" ON "core"."video_upload"("userId", "status");

-- CreateIndex
CREATE INDEX "Comment_videoId_parentId_createdAt_idx" ON "core"."Comment"("videoId", "parentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Comment_userId_createdAt_idx" ON "core"."Comment"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "channel_notification_channelId_idx" ON "core"."channel_notification"("channelId");

-- CreateIndex
CREATE INDEX "channel_notification_channelId_createdAt_idx" ON "core"."channel_notification"("channelId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "channel_notification_channelId_is_read_idx" ON "core"."channel_notification"("channelId", "is_read");

-- CreateIndex
CREATE INDEX "system_notification_userId_idx" ON "core"."system_notification"("userId");

-- CreateIndex
CREATE INDEX "system_notification_userId_createdAt_idx" ON "core"."system_notification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "system_notification_userId_is_read_idx" ON "core"."system_notification"("userId", "is_read");

-- AddForeignKey
ALTER TABLE "core"."video_hashtag" ADD CONSTRAINT "video_hashtag_hashtag_id_fkey" FOREIGN KEY ("hashtag_id") REFERENCES "core"."hashtag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."video_hashtag" ADD CONSTRAINT "video_hashtag_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "core"."video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."subscribe" ADD CONSTRAINT "subscribe_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "core"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."subscribe" ADD CONSTRAINT "subscribe_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."watch_history" ADD CONSTRAINT "watch_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."watch_history" ADD CONSTRAINT "watch_history_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "core"."video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."video" ADD CONSTRAINT "video_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "core"."video_upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."video" ADD CONSTRAINT "video_user_owner_fkey" FOREIGN KEY ("user_owner") REFERENCES "core"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."like_video" ADD CONSTRAINT "like_video_userId_fkey" FOREIGN KEY ("userId") REFERENCES "core"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."like_video" ADD CONSTRAINT "like_video_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "core"."video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."video_processing" ADD CONSTRAINT "video_processing_videoUploadId_fkey" FOREIGN KEY ("videoUploadId") REFERENCES "core"."video_upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."video_upload" ADD CONSTRAINT "video_upload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "core"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "core"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."Comment" ADD CONSTRAINT "Comment_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "core"."video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."channel_notification" ADD CONSTRAINT "channel_notification_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "core"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."system_notification" ADD CONSTRAINT "system_notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "core"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
