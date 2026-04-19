/*
  Warnings:

  - Made the column `duration` on table `video` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "video" ADD COLUMN     "videoDesc" TEXT,
ALTER COLUMN "duration" SET NOT NULL,
ALTER COLUMN "duration" SET DEFAULT 0;
