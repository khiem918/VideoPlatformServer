/*
  Warnings:

  - Made the column `videoId` on table `video_upload` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "core"."video_upload" ALTER COLUMN "videoId" SET NOT NULL;
