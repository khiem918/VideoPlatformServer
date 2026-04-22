/*
  Warnings:

  - Added the required column `fail_in` to the `video_upload` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VideoFail" AS ENUM ('Vectorlize', 'Process');

-- AlterTable
ALTER TABLE "video_upload" ADD COLUMN     "fail_in" "VideoFail" NOT NULL;
