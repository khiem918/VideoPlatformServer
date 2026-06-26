/*
  Warnings:

  - The values [PROCESSED] on the enum `UploadMetaStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "core"."UploadMetaStatus_new" AS ENUM ('PENDING', 'UPDATED');
ALTER TABLE "core"."video_upload" ALTER COLUMN "metaStatus" DROP DEFAULT;
ALTER TABLE "core"."video_upload" ALTER COLUMN "metaStatus" TYPE "core"."UploadMetaStatus_new" USING ("metaStatus"::text::"core"."UploadMetaStatus_new");
ALTER TYPE "core"."UploadMetaStatus" RENAME TO "UploadMetaStatus_old";
ALTER TYPE "core"."UploadMetaStatus_new" RENAME TO "UploadMetaStatus";
DROP TYPE "core"."UploadMetaStatus_old";
ALTER TABLE "core"."video_upload" ALTER COLUMN "metaStatus" SET DEFAULT 'PENDING';
COMMIT;
