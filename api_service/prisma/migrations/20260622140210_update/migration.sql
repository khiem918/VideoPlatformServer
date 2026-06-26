-- CreateEnum
CREATE TYPE "core"."VideoStatus" AS ENUM ('Available', 'Processing', 'Error');

-- DropIndex
DROP INDEX "core"."video_upload_metaStatus_idx";

-- AlterTable
ALTER TABLE "core"."video" ADD COLUMN     "video_status" "core"."VideoStatus" NOT NULL DEFAULT 'Processing';

-- CreateIndex
CREATE INDEX "video_upload_metaStatus_videoStatus_idx" ON "core"."video_upload"("metaStatus", "videoStatus");
