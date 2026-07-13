/*
  Warnings:

  - You are about to drop the column `PlaylistPath` on the `video_processing` table. All the data in the column will be lost.
  - You are about to drop the column `thumbnailPath` on the `video_processing` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `video_upload` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "core"."UploadVideoStatus" AS ENUM ('PENDING', 'UPLOADED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "core"."UploadMetaStatus" AS ENUM ('PENDING', 'UPDATED', 'PROCESSED');

-- DropIndex
DROP INDEX "core"."video_upload_status_idx";

-- DropIndex
DROP INDEX "core"."video_upload_userId_status_idx";

-- AlterTable
ALTER TABLE "core"."video_processing" DROP COLUMN "PlaylistPath",
DROP COLUMN "thumbnailPath";

-- AlterTable
ALTER TABLE "core"."video_upload" DROP COLUMN "status",
ADD COLUMN     "metaStatus" "core"."UploadMetaStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "videoStatus" "core"."UploadVideoStatus" NOT NULL DEFAULT 'PENDING';

-- DropEnum
DROP TYPE "core"."UploadStatus";

-- DropEnum
DROP TYPE "core"."VideoFail";

-- CreateIndex
CREATE INDEX "video_upload_metaStatus_idx" ON "core"."video_upload"("metaStatus");

-- CreateIndex
CREATE INDEX "video_upload_userId_videoStatus_metaStatus_idx" ON "core"."video_upload"("userId", "videoStatus", "metaStatus");
