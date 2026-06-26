/*
  Warnings:

  - The primary key for the `video_hashtag` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `hashtag_id` on the `video_hashtag` table. All the data in the column will be lost.
  - You are about to drop the `hashtag` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "core"."UploadMetaStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "core"."UploadMetaStatus" ADD VALUE 'PROCESSED';
ALTER TYPE "core"."UploadMetaStatus" ADD VALUE 'FAILED';

-- DropForeignKey
ALTER TABLE "core"."video_hashtag" DROP CONSTRAINT "video_hashtag_hashtag_id_fkey";

-- DropIndex
DROP INDEX "core"."video_hashtag_hashtag_id_idx";

-- AlterTable
ALTER TABLE "core"."video_hashtag" DROP CONSTRAINT "video_hashtag_pkey",
DROP COLUMN "hashtag_id",
ADD CONSTRAINT "video_hashtag_pkey" PRIMARY KEY ("video_id");

-- DropTable
DROP TABLE "core"."hashtag";
