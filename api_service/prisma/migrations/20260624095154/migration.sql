-- DropIndex
DROP INDEX "core"."video_user_owner_idx";

-- CreateIndex
CREATE INDEX "video_id_user_owner_idx" ON "core"."video"("id", "user_owner");
