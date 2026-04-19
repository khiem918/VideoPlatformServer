/*
  Warnings:

  - The primary key for the `video_variant` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `videoId` on the `video_variant` table. All the data in the column will be lost.
  - Added the required column `processingId` to the `video_variant` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "video_variant" DROP CONSTRAINT "video_variant_videoId_fkey";

-- AlterTable
ALTER TABLE "video_variant" DROP CONSTRAINT "video_variant_pkey",
DROP COLUMN "videoId",
ADD COLUMN     "processingId" TEXT NOT NULL,
ADD CONSTRAINT "video_variant_pkey" PRIMARY KEY ("processingId", "resolution");

-- AddForeignKey
ALTER TABLE "video_variant" ADD CONSTRAINT "video_variant_processingId_fkey" FOREIGN KEY ("processingId") REFERENCES "video_processing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
