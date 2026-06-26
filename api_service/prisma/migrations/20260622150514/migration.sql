/*
  Warnings:

  - The values [PUBLISHED] on the enum `VideoVisibility` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "core"."VideoVisibility_new" AS ENUM ('DRAFT', 'PUBLIC', 'PRIVATE');
ALTER TABLE "core"."video" ALTER COLUMN "video_visibility" DROP DEFAULT;
ALTER TABLE "core"."video" ALTER COLUMN "video_visibility" TYPE "core"."VideoVisibility_new" USING ("video_visibility"::text::"core"."VideoVisibility_new");
ALTER TYPE "core"."VideoVisibility" RENAME TO "VideoVisibility_old";
ALTER TYPE "core"."VideoVisibility_new" RENAME TO "VideoVisibility";
DROP TYPE "core"."VideoVisibility_old";
ALTER TABLE "core"."video" ALTER COLUMN "video_visibility" SET DEFAULT 'DRAFT';
COMMIT;
