/*
  Warnings:

  - You are about to drop the column `r2_path` on the `video_upload` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[object_path]` on the table `video_upload` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `object_path` to the `video_upload` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "core"."video_upload_r2_path_key";

-- AlterTable
ALTER TABLE "core"."video_upload" DROP COLUMN "r2_path",
ADD COLUMN     "object_path" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "video_upload_object_path_key" ON "core"."video_upload"("object_path");
