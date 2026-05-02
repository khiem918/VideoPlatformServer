/*
  Warnings:

  - A unique constraint covering the columns `[uploadId]` on the table `video` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "video_uploadId_key" ON "video"("uploadId");
