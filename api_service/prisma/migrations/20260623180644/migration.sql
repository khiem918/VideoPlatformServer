/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `likeCount` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `parentId` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `replyCount` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `videoId` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `channelId` on the `channel_notification` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `channel_notification` table. All the data in the column will be lost.
  - The primary key for the `like_video` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `isLike` on the `like_video` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `like_video` table. All the data in the column will be lost.
  - You are about to drop the column `videoId` on the `like_video` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `system_notification` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `system_notification` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `video` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `video` table. All the data in the column will be lost.
  - You are about to drop the column `videoDesc` on the `video` table. All the data in the column will be lost.
  - You are about to drop the column `completedAt` on the `video_processing` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `video_processing` table. All the data in the column will be lost.
  - You are about to drop the column `errorMessage` on the `video_processing` table. All the data in the column will be lost.
  - You are about to drop the column `startedAt` on the `video_processing` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `video_processing` table. All the data in the column will be lost.
  - You are about to drop the column `completedAt` on the `video_upload` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `video_upload` table. All the data in the column will be lost.
  - You are about to drop the column `fileName` on the `video_upload` table. All the data in the column will be lost.
  - You are about to drop the column `fileSize` on the `video_upload` table. All the data in the column will be lost.
  - You are about to drop the column `metaStatus` on the `video_upload` table. All the data in the column will be lost.
  - You are about to drop the column `mimeType` on the `video_upload` table. All the data in the column will be lost.
  - You are about to drop the column `processingJobId` on the `video_upload` table. All the data in the column will be lost.
  - You are about to drop the column `r2Path` on the `video_upload` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `video_upload` table. All the data in the column will be lost.
  - You are about to drop the column `uploadedAt` on the `video_upload` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `video_upload` table. All the data in the column will be lost.
  - You are about to drop the column `videoId` on the `video_upload` table. All the data in the column will be lost.
  - You are about to drop the column `videoStatus` on the `video_upload` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[r2_path]` on the table `video_upload` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[video_id]` on the table `video_upload` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `user_id` to the `Comment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `video_id` to the `Comment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `channel_id` to the `channel_notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `like_video` table without a default value. This is not possible if the table is not empty.
  - Added the required column `video_id` to the `like_video` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `system_notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `video` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `video_processing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `file_name` to the `video_upload` table without a default value. This is not possible if the table is not empty.
  - Added the required column `file_size` to the `video_upload` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mime_type` to the `video_upload` table without a default value. This is not possible if the table is not empty.
  - Added the required column `r2_path` to the `video_upload` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `video_upload` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `video_upload` table without a default value. This is not possible if the table is not empty.
  - Added the required column `video_id` to the `video_upload` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "core"."Comment" DROP CONSTRAINT "Comment_userId_fkey";

-- DropForeignKey
ALTER TABLE "core"."Comment" DROP CONSTRAINT "Comment_videoId_fkey";

-- DropForeignKey
ALTER TABLE "core"."channel_notification" DROP CONSTRAINT "channel_notification_channelId_fkey";

-- DropForeignKey
ALTER TABLE "core"."like_video" DROP CONSTRAINT "like_video_userId_fkey";

-- DropForeignKey
ALTER TABLE "core"."like_video" DROP CONSTRAINT "like_video_videoId_fkey";

-- DropForeignKey
ALTER TABLE "core"."system_notification" DROP CONSTRAINT "system_notification_userId_fkey";

-- DropForeignKey
ALTER TABLE "core"."video_upload" DROP CONSTRAINT "video_upload_userId_fkey";

-- DropForeignKey
ALTER TABLE "core"."video_upload" DROP CONSTRAINT "video_upload_videoId_fkey";

-- DropIndex
DROP INDEX "core"."Comment_likeCount_idx";

-- DropIndex
DROP INDEX "core"."Comment_userId_createdAt_idx";

-- DropIndex
DROP INDEX "core"."Comment_videoId_parentId_createdAt_idx";

-- DropIndex
DROP INDEX "core"."channel_notification_channelId_createdAt_idx";

-- DropIndex
DROP INDEX "core"."channel_notification_channelId_idx";

-- DropIndex
DROP INDEX "core"."channel_notification_channelId_is_read_idx";

-- DropIndex
DROP INDEX "core"."like_video_videoId_idx";

-- DropIndex
DROP INDEX "core"."system_notification_userId_createdAt_idx";

-- DropIndex
DROP INDEX "core"."system_notification_userId_idx";

-- DropIndex
DROP INDEX "core"."system_notification_userId_is_read_idx";

-- DropIndex
DROP INDEX "core"."video_createdAt_idx";

-- DropIndex
DROP INDEX "core"."video_video_visibility_createdAt_idx";

-- DropIndex
DROP INDEX "core"."video_processing_createdAt_idx";

-- DropIndex
DROP INDEX "core"."video_processing_status_createdAt_idx";

-- DropIndex
DROP INDEX "core"."video_upload_createdAt_idx";

-- DropIndex
DROP INDEX "core"."video_upload_metaStatus_videoStatus_idx";

-- DropIndex
DROP INDEX "core"."video_upload_r2Path_key";

-- DropIndex
DROP INDEX "core"."video_upload_userId_videoStatus_metaStatus_idx";

-- DropIndex
DROP INDEX "core"."video_upload_videoId_key";

-- AlterTable
ALTER TABLE "core"."Comment" DROP COLUMN "createdAt",
DROP COLUMN "likeCount",
DROP COLUMN "parentId",
DROP COLUMN "replyCount",
DROP COLUMN "userId",
DROP COLUMN "videoId",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "like_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parent_id" TEXT,
ADD COLUMN     "reply_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "user_id" TEXT NOT NULL,
ADD COLUMN     "video_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "core"."channel_notification" DROP COLUMN "channelId",
DROP COLUMN "createdAt",
ADD COLUMN     "channel_id" TEXT NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "core"."like_video" DROP CONSTRAINT "like_video_pkey",
DROP COLUMN "isLike",
DROP COLUMN "userId",
DROP COLUMN "videoId",
ADD COLUMN     "is_like" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "user_id" TEXT NOT NULL,
ADD COLUMN     "video_id" TEXT NOT NULL,
ADD CONSTRAINT "like_video_pkey" PRIMARY KEY ("user_id", "video_id");

-- AlterTable
ALTER TABLE "core"."system_notification" DROP COLUMN "createdAt",
DROP COLUMN "userId",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "user_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "core"."video" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
DROP COLUMN "videoDesc",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "video_desc" TEXT;

-- AlterTable
ALTER TABLE "core"."video_processing" DROP COLUMN "completedAt",
DROP COLUMN "createdAt",
DROP COLUMN "errorMessage",
DROP COLUMN "startedAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "started_at" TIMESTAMP(3),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "core"."video_upload" DROP COLUMN "completedAt",
DROP COLUMN "createdAt",
DROP COLUMN "fileName",
DROP COLUMN "fileSize",
DROP COLUMN "metaStatus",
DROP COLUMN "mimeType",
DROP COLUMN "processingJobId",
DROP COLUMN "r2Path",
DROP COLUMN "updatedAt",
DROP COLUMN "uploadedAt",
DROP COLUMN "userId",
DROP COLUMN "videoId",
DROP COLUMN "videoStatus",
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "file_name" TEXT NOT NULL,
ADD COLUMN     "file_size" BIGINT NOT NULL,
ADD COLUMN     "meta_status" "core"."UploadMetaStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "mime_type" TEXT NOT NULL,
ADD COLUMN     "processing_job_id" TEXT,
ADD COLUMN     "r2_path" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "user_id" TEXT NOT NULL,
ADD COLUMN     "video_id" TEXT NOT NULL,
ADD COLUMN     "video_status" "core"."UploadVideoStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Comment_video_id_parent_id_created_at_idx" ON "core"."Comment"("video_id", "parent_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "Comment_user_id_created_at_idx" ON "core"."Comment"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "Comment_like_count_idx" ON "core"."Comment"("like_count" DESC);

-- CreateIndex
CREATE INDEX "channel_notification_channel_id_idx" ON "core"."channel_notification"("channel_id");

-- CreateIndex
CREATE INDEX "channel_notification_channel_id_created_at_idx" ON "core"."channel_notification"("channel_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "channel_notification_channel_id_is_read_idx" ON "core"."channel_notification"("channel_id", "is_read");

-- CreateIndex
CREATE INDEX "like_video_video_id_idx" ON "core"."like_video"("video_id");

-- CreateIndex
CREATE INDEX "system_notification_user_id_idx" ON "core"."system_notification"("user_id");

-- CreateIndex
CREATE INDEX "system_notification_user_id_created_at_idx" ON "core"."system_notification"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "system_notification_user_id_is_read_idx" ON "core"."system_notification"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "video_created_at_idx" ON "core"."video"("created_at" DESC);

-- CreateIndex
CREATE INDEX "video_video_visibility_created_at_idx" ON "core"."video"("video_visibility", "created_at" DESC);

-- CreateIndex
CREATE INDEX "video_processing_created_at_idx" ON "core"."video_processing"("created_at" DESC);

-- CreateIndex
CREATE INDEX "video_processing_status_created_at_idx" ON "core"."video_processing"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "video_upload_r2_path_key" ON "core"."video_upload"("r2_path");

-- CreateIndex
CREATE UNIQUE INDEX "video_upload_video_id_key" ON "core"."video_upload"("video_id");

-- CreateIndex
CREATE INDEX "video_upload_meta_status_video_status_idx" ON "core"."video_upload"("meta_status", "video_status");

-- CreateIndex
CREATE INDEX "video_upload_created_at_idx" ON "core"."video_upload"("created_at" DESC);

-- CreateIndex
CREATE INDEX "video_upload_user_id_video_status_meta_status_idx" ON "core"."video_upload"("user_id", "video_status", "meta_status");

-- AddForeignKey
ALTER TABLE "core"."like_video" ADD CONSTRAINT "like_video_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."like_video" ADD CONSTRAINT "like_video_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "core"."video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."video_upload" ADD CONSTRAINT "video_upload_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "core"."video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."video_upload" ADD CONSTRAINT "video_upload_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."Comment" ADD CONSTRAINT "Comment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."Comment" ADD CONSTRAINT "Comment_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "core"."video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."channel_notification" ADD CONSTRAINT "channel_notification_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "core"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."system_notification" ADD CONSTRAINT "system_notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
