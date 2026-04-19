/*
  Warnings:

  - The values [PUBLIC,PRIVATE,UNLISTED] on the enum `VideoVisibility` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "VideoVisibility_new" AS ENUM ('DRAFT', 'PUBLISHED');
ALTER TABLE "core"."video" ALTER COLUMN "video_visibility" DROP DEFAULT;
ALTER TABLE "video" ALTER COLUMN "video_visibility" TYPE "VideoVisibility_new" USING ("video_visibility"::text::"VideoVisibility_new");
ALTER TYPE "VideoVisibility" RENAME TO "VideoVisibility_old";
ALTER TYPE "VideoVisibility_new" RENAME TO "VideoVisibility";
DROP TYPE "core"."VideoVisibility_old";
ALTER TABLE "video" ALTER COLUMN "video_visibility" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterTable
ALTER TABLE "video" ALTER COLUMN "video_visibility" SET DEFAULT 'DRAFT';
