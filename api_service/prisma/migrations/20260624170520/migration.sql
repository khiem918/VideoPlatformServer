-- DropIndex
DROP INDEX "core"."video_processing_created_at_idx";

-- AlterTable
ALTER TABLE "core"."video_upload" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "video_processing_id_idx" ON "core"."video_processing"("id");
