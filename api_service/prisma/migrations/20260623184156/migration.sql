/*
  Warnings:

  - Added the required column `video_id` to the `video_processing` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "core"."video_processing" ADD COLUMN     "video_id" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "core"."video_processing" ADD CONSTRAINT "video_processing_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "core"."video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
