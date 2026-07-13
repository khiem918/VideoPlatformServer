/*
  Warnings:

  - The values [PENDING] on the enum `UploadVideoStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "core"."UploadVideoStatus_new" AS ENUM ('UPLOADED', 'PROCESSING', 'COMPLETED', 'FAILED');
ALTER TABLE "core"."video_upload" ALTER COLUMN "video_status" DROP DEFAULT;
ALTER TABLE "core"."video_upload" ALTER COLUMN "video_status" TYPE "core"."UploadVideoStatus_new" USING ("video_status"::text::"core"."UploadVideoStatus_new");
ALTER TYPE "core"."UploadVideoStatus" RENAME TO "UploadVideoStatus_old";
ALTER TYPE "core"."UploadVideoStatus_new" RENAME TO "UploadVideoStatus";
DROP TYPE "core"."UploadVideoStatus_old";
ALTER TABLE "core"."video_upload" ALTER COLUMN "video_status" SET DEFAULT 'UPLOADED';
COMMIT;

-- AlterTable
ALTER TABLE "core"."video_upload" ALTER COLUMN "video_status" SET DEFAULT 'UPLOADED';
