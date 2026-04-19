/*
  Warnings:

  - You are about to drop the column `subscribe_conut` on the `user` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `video` table without a default value. This is not possible if the table is not empty.
  - Added the required column `uploadId` to the `video` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'UPLOADED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'TRANSCODING', 'THUMBNAIL', 'HLS_GENERATION', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "VideoVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'UNLISTED');

-- CreateEnum
CREATE TYPE "Resolution" AS ENUM ('x144p', 'x360p', 'x480p', 'x720p', 'x1080p', 'x1440p', 'x2160p');

-- AlterTable
ALTER TABLE "user" DROP COLUMN "subscribe_conut",
ADD COLUMN     "subscribe_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "video" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "thumbnail_url" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "uploadId" TEXT NOT NULL,
ADD COLUMN     "video_visibility" "VideoVisibility" NOT NULL DEFAULT 'PRIVATE',
ALTER COLUMN "video_url_storage" DROP NOT NULL;

-- CreateTable
CREATE TABLE "video_processing" (
    "id" TEXT NOT NULL,
    "videoUploadId" TEXT NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "hlsPlaylistPath" TEXT,
    "thumbnailPath" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_processing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_upload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "r2Path" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "processingJobId" TEXT,
    "thumbnail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_variant" (
    "videoId" TEXT NOT NULL,
    "resolution" "Resolution" NOT NULL,
    "bitrate" INTEGER NOT NULL,
    "path" TEXT NOT NULL,

    CONSTRAINT "video_variant_pkey" PRIMARY KEY ("videoId","resolution")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_processing_videoUploadId_key" ON "video_processing"("videoUploadId");

-- CreateIndex
CREATE UNIQUE INDEX "video_upload_r2Path_key" ON "video_upload"("r2Path");

-- AddForeignKey
ALTER TABLE "video" ADD CONSTRAINT "video_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "video_upload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_processing" ADD CONSTRAINT "video_processing_videoUploadId_fkey" FOREIGN KEY ("videoUploadId") REFERENCES "video_upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_upload" ADD CONSTRAINT "video_upload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_variant" ADD CONSTRAINT "video_variant_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "video_processing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
