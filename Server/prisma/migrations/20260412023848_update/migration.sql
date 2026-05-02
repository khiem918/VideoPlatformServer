/*
  Warnings:

  - You are about to drop the column `hashtag_name` on the `hashtag` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "hashtag_hashtag_name_key";

-- AlterTable
ALTER TABLE "hashtag" DROP COLUMN "hashtag_name";
