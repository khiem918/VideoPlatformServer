/*
  Warnings:

  - You are about to drop the column `slug` on the `hashtag` table. All the data in the column will be lost.
  - You are about to drop the column `usageCount` on the `hashtag` table. All the data in the column will be lost.
  - You are about to drop the `hashtag_alias` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `hashtag_pending` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[normalized_tag]` on the table `hashtag` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `normalized_tag` to the `hashtag` table without a default value. This is not possible if the table is not empty.
  - Added the required column `display_tag` to the `video_hashtag` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "hashtag_alias" DROP CONSTRAINT "hashtag_alias_hashtagId_fkey";

-- DropIndex
DROP INDEX "hashtag_slug_key";

-- AlterTable
ALTER TABLE "hashtag" DROP COLUMN "slug",
DROP COLUMN "usageCount",
ADD COLUMN     "count" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "isCanoncial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "normalized_tag" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "video_hashtag" ADD COLUMN     "display_tag" TEXT NOT NULL;

-- DropTable
DROP TABLE "hashtag_alias";

-- DropTable
DROP TABLE "hashtag_pending";

-- CreateIndex
CREATE UNIQUE INDEX "hashtag_normalized_tag_key" ON "hashtag"("normalized_tag");
