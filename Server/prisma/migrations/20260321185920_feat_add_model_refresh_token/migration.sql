-- DropForeignKey
ALTER TABLE "watch_history" DROP CONSTRAINT "watch_history_user_id_fkey";

-- DropForeignKey
ALTER TABLE "watch_history" DROP CONSTRAINT "watch_history_video_id_fkey";

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_agent" VARCHAR(512),
    "ip" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "replaced_by_token" TEXT,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_key" ON "refresh_token"("token");

-- AddForeignKey
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
