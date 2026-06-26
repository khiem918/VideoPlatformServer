-- AlterEnum
ALTER TYPE "core"."ProcessingStatus" ADD VALUE 'DEAD';

-- AlterTable
ALTER TABLE "core"."video_processing" ADD COLUMN     "retry_count" INTEGER NOT NULL DEFAULT 0;
