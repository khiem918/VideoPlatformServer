/*
  Warnings:

  - You are about to drop the `VideoTest` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "test"."VideoTest";

-- CreateIndex
CREATE INDEX "Comment_userId_createdAt_idx" ON "Comment"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "channel_notification_channelId_createdAt_idx" ON "channel_notification"("channelId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "channel_notification_channelId_is_read_idx" ON "channel_notification"("channelId", "is_read");

-- CreateIndex
CREATE INDEX "like_video_videoId_idx" ON "like_video"("videoId");

-- CreateIndex
CREATE INDEX "system_notification_userId_createdAt_idx" ON "system_notification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "system_notification_userId_is_read_idx" ON "system_notification"("userId", "is_read");

-- CreateIndex
CREATE INDEX "video_video_visibility_createdAt_idx" ON "video"("video_visibility", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "video_video_visibility_video_view_idx" ON "video"("video_visibility", "video_view" DESC);

-- CreateIndex
CREATE INDEX "video_video_released_date_idx" ON "video"("video_released_date" DESC);

-- CreateIndex
CREATE INDEX "video_processing_status_createdAt_idx" ON "video_processing"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "video_upload_userId_status_idx" ON "video_upload"("userId", "status");

-- CreateIndex
CREATE INDEX "watch_history_user_id_watched_at_idx" ON "watch_history"("user_id", "watched_at" DESC);
