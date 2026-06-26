-- AlterEnum
ALTER TYPE "core"."UploadVideoStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "core"."video_upload" ALTER COLUMN "video_status" SET DEFAULT 'PENDING';
