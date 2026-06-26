/*
  Warnings:

  - The values [VIDEO_FAILED,META_FAILED] on the enum `VideoStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "core"."VideoStatus_new" AS ENUM ('AVAILABLE', 'PROCESSING');
ALTER TABLE "core"."video" ALTER COLUMN "video_status" TYPE "core"."VideoStatus_new" USING ("video_status"::text::"core"."VideoStatus_new");
ALTER TYPE "core"."VideoStatus" RENAME TO "VideoStatus_old";
ALTER TYPE "core"."VideoStatus_new" RENAME TO "VideoStatus";
DROP TYPE "core"."VideoStatus_old";
COMMIT;
