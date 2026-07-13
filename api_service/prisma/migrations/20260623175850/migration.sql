/*
  Warnings:

  - The values [PENDING] on the enum `ProcessingStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [MERTA_FAILED] on the enum `VideoStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `videoUploadId` on the `video_processing` table. All the data in the column will be lost.
  - Added the required column `processing_type` to the `video_processing` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "core"."ProcessingType" AS ENUM ('VIDEO', 'META');

-- AlterEnum
BEGIN;
CREATE TYPE "core"."ProcessingStatus_new" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');
ALTER TABLE "core"."video_processing" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "core"."video_processing" ALTER COLUMN "status" TYPE "core"."ProcessingStatus_new" USING ("status"::text::"core"."ProcessingStatus_new");
ALTER TYPE "core"."ProcessingStatus" RENAME TO "ProcessingStatus_old";
ALTER TYPE "core"."ProcessingStatus_new" RENAME TO "ProcessingStatus";
DROP TYPE "core"."ProcessingStatus_old";
ALTER TABLE "core"."video_processing" ALTER COLUMN "status" SET DEFAULT 'PROCESSING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "core"."VideoStatus_new" AS ENUM ('AVAILABLE', 'PROCESSING', 'VIDEO_FAILED', 'META_FAILED');
ALTER TABLE "core"."video" ALTER COLUMN "video_status" DROP DEFAULT;
ALTER TABLE "core"."video" ALTER COLUMN "video_status" TYPE "core"."VideoStatus_new" USING ("video_status"::text::"core"."VideoStatus_new");
ALTER TYPE "core"."VideoStatus" RENAME TO "VideoStatus_old";
ALTER TYPE "core"."VideoStatus_new" RENAME TO "VideoStatus";
DROP TYPE "core"."VideoStatus_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "core"."video_processing" DROP CONSTRAINT "video_processing_videoUploadId_fkey";

-- DropIndex
DROP INDEX "core"."video_processing_videoUploadId_key";

-- AlterTable
ALTER TABLE "core"."video" ALTER COLUMN "video_like" SET DATA TYPE BIGINT,
ALTER COLUMN "video_dislike" SET DATA TYPE BIGINT,
ALTER COLUMN "video_status" DROP NOT NULL,
ALTER COLUMN "video_status" DROP DEFAULT;

-- AlterTable
ALTER TABLE "core"."video_processing" DROP COLUMN "videoUploadId",
ADD COLUMN     "processing_type" "core"."ProcessingType" NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PROCESSING';

-- CreateIndex
CREATE INDEX "Comment_likeCount_idx" ON "core"."Comment"("likeCount" DESC);
