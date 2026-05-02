/*
  Warnings:

  - The primary key for the `subscribe` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `userId` on the `subscribe` table. All the data in the column will be lost.
  - You are about to drop the column `uploadId` on the `video` table. All the data in the column will be lost.
  - The primary key for the `video_variant` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `processingId` on the `video_variant` table. All the data in the column will be lost.
  - You are about to drop the `hagtag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `video_hagtag` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[upload_id]` on the table `video` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `user_id` to the `subscribe` table without a default value. This is not possible if the table is not empty.
  - Added the required column `upload_id` to the `video` table without a default value. This is not possible if the table is not empty.
  - Added the required column `processing_id` to the `video_variant` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "subscribe" DROP CONSTRAINT "subscribe_userId_fkey";

-- DropForeignKey
ALTER TABLE "video" DROP CONSTRAINT "video_uploadId_fkey";

-- DropForeignKey
ALTER TABLE "video_hagtag" DROP CONSTRAINT "video_hagtag_hagtag_id_fkey";

-- DropForeignKey
ALTER TABLE "video_hagtag" DROP CONSTRAINT "video_hagtag_video_id_fkey";

-- DropForeignKey
ALTER TABLE "video_variant" DROP CONSTRAINT "video_variant_processingId_fkey";

-- DropIndex
DROP INDEX "video_uploadId_key";

-- AlterTable
ALTER TABLE "subscribe" DROP CONSTRAINT "subscribe_pkey",
DROP COLUMN "userId",
ADD COLUMN     "user_id" TEXT NOT NULL,
ADD CONSTRAINT "subscribe_pkey" PRIMARY KEY ("user_id", "channel_id");

-- AlterTable
ALTER TABLE "video" DROP COLUMN "uploadId",
ADD COLUMN     "upload_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "video_variant" DROP CONSTRAINT "video_variant_pkey",
DROP COLUMN "processingId",
ADD COLUMN     "processing_id" TEXT NOT NULL,
ADD CONSTRAINT "video_variant_pkey" PRIMARY KEY ("processing_id", "resolution");

-- DropTable
DROP TABLE "hagtag";

-- DropTable
DROP TABLE "video_hagtag";

-- CreateTable
CREATE TABLE "hashtag" (
    "id" TEXT NOT NULL,
    "hashtag_name" VARCHAR(1000) NOT NULL,

    CONSTRAINT "hashtag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_hashtag" (
    "video_id" TEXT NOT NULL,
    "hashtag_id" TEXT NOT NULL,

    CONSTRAINT "video_hashtag_pkey" PRIMARY KEY ("video_id","hashtag_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_upload_id_key" ON "video"("upload_id");

-- AddForeignKey
ALTER TABLE "video_hashtag" ADD CONSTRAINT "video_hashtag_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_hashtag" ADD CONSTRAINT "video_hashtag_hashtag_id_fkey" FOREIGN KEY ("hashtag_id") REFERENCES "hashtag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscribe" ADD CONSTRAINT "subscribe_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video" ADD CONSTRAINT "video_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "video_upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_variant" ADD CONSTRAINT "video_variant_processing_id_fkey" FOREIGN KEY ("processing_id") REFERENCES "video_processing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
