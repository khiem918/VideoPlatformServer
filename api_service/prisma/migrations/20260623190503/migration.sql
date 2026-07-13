/*
  Warnings:

  - You are about to drop the column `processing_job_id` on the `video_upload` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "core"."video_upload" DROP COLUMN "processing_job_id";
