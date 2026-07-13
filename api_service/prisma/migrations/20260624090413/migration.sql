/*
  Warnings:

  - You are about to drop the column `completed_at` on the `video_upload` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `video_upload` table. All the data in the column will be lost.
  - You are about to drop the column `file_name` on the `video_upload` table. All the data in the column will be lost.
  - You are about to drop the column `uploaded_at` on the `video_upload` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `video_upload` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "core"."video_upload" DROP CONSTRAINT "video_upload_user_id_fkey";

-- DropIndex
DROP INDEX "core"."video_upload_created_at_idx";

-- DropIndex
DROP INDEX "core"."video_upload_user_id_video_status_meta_status_idx";

-- AlterTable
ALTER TABLE "core"."video_upload" DROP COLUMN "completed_at",
DROP COLUMN "created_at",
DROP COLUMN "file_name",
DROP COLUMN "uploaded_at",
DROP COLUMN "user_id",
ADD COLUMN     "meta_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "video_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "video_upload_video_id_video_status_meta_status_idx" ON "core"."video_upload"("video_id", "video_status", "meta_status");
