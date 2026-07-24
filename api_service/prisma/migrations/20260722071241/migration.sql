/*
  Warnings:

  - You are about to drop the column `video_id` on the `video_processing` table. All the data in the column will be lost.
  - You are about to drop the `video_upload` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `video_information_id` to the `video_processing` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "core"."video_processing" DROP CONSTRAINT "video_processing_video_id_fkey";

-- DropForeignKey
ALTER TABLE "core"."video_upload" DROP CONSTRAINT "video_upload_video_id_fkey";

-- AlterTable
ALTER TABLE "core"."video_processing" DROP COLUMN "video_id",
ADD COLUMN     "video_information_id" TEXT NOT NULL;

-- DropTable
DROP TABLE "core"."video_upload";

-- CreateTable
CREATE TABLE "core"."video_information" (
    "id" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "object_path" TEXT NOT NULL,
    "video_status" "core"."UploadVideoStatus" NOT NULL DEFAULT 'PENDING',
    "meta_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "video_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "video_id" TEXT NOT NULL,
    "meta_status" "core"."UploadMetaStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "video_information_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_information_object_path_key" ON "core"."video_information"("object_path");

-- CreateIndex
CREATE UNIQUE INDEX "video_information_video_id_key" ON "core"."video_information"("video_id");

-- CreateIndex
CREATE INDEX "video_information_meta_status_video_status_idx" ON "core"."video_information"("meta_status", "video_status");

-- CreateIndex
CREATE INDEX "video_information_video_id_video_status_meta_status_idx" ON "core"."video_information"("video_id", "video_status", "meta_status");

-- AddForeignKey
ALTER TABLE "core"."video_information" ADD CONSTRAINT "video_information_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "core"."video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."video_processing" ADD CONSTRAINT "video_processing_video_information_id_fkey" FOREIGN KEY ("video_information_id") REFERENCES "core"."video_information"("id") ON DELETE CASCADE ON UPDATE CASCADE;
