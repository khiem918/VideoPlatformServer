/*
  Warnings:

  - The primary key for the `Comment` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `rawDesc` on the `video` table. All the data in the column will be lost.
  - You are about to drop the column `upload_id` on the `video` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[videoId]` on the table `video_upload` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "core"."video" DROP CONSTRAINT "video_upload_id_fkey";

-- DropIndex
DROP INDEX "core"."video_upload_id_key";

-- AlterTable
ALTER TABLE "core"."Comment" DROP CONSTRAINT "Comment_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "parentId" SET DATA TYPE TEXT,
ADD CONSTRAINT "Comment_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "core"."video" DROP COLUMN "rawDesc",
DROP COLUMN "upload_id";

-- AlterTable
ALTER TABLE "core"."video_upload" ADD COLUMN     "videoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "video_upload_videoId_key" ON "core"."video_upload"("videoId");

-- AddForeignKey
ALTER TABLE "core"."video_upload" ADD CONSTRAINT "video_upload_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "core"."video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
