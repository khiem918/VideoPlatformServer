/*
  Warnings:

  - You are about to alter the column `thumbnail_url` on the `video` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(1000)`.
  - You are about to drop the column `thumbnail` on the `video_upload` table. All the data in the column will be lost.
  - Made the column `video_url_storage` on table `video` required. This step will fail if there are existing NULL values in that column.
  - Made the column `thumbnail_url` on table `video` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "core"."video" ALTER COLUMN "video_url_storage" SET NOT NULL,
ALTER COLUMN "video_url_storage" SET DEFAULT '',
ALTER COLUMN "thumbnail_url" SET NOT NULL,
ALTER COLUMN "thumbnail_url" SET DEFAULT '',
ALTER COLUMN "thumbnail_url" SET DATA TYPE VARCHAR(1000);

-- AlterTable
ALTER TABLE "core"."video_upload" DROP COLUMN "thumbnail";
