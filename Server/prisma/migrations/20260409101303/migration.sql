/*
  Warnings:

  - You are about to alter the column `hashtag_name` on the `hashtag` table. The data in that column could be lost. The data in that column will be cast from `VarChar(1000)` to `VarChar(100)`.
  - A unique constraint covering the columns `[hashtag_name]` on the table `hashtag` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `hashtag` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `slug` to the `hashtag` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "hashtag" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "slug" TEXT NOT NULL,
ADD COLUMN     "usageCount" BIGINT NOT NULL DEFAULT 0,
ALTER COLUMN "hashtag_name" SET DATA TYPE VARCHAR(100);

-- CreateTable
CREATE TABLE "hashtag_alias" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashtagId" TEXT NOT NULL,

    CONSTRAINT "hashtag_alias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hashtag_alias_name_key" ON "hashtag_alias"("name");

-- CreateIndex
CREATE UNIQUE INDEX "hashtag_hashtag_name_key" ON "hashtag"("hashtag_name");

-- CreateIndex
CREATE UNIQUE INDEX "hashtag_slug_key" ON "hashtag"("slug");

-- AddForeignKey
ALTER TABLE "hashtag_alias" ADD CONSTRAINT "hashtag_alias_hashtagId_fkey" FOREIGN KEY ("hashtagId") REFERENCES "hashtag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
