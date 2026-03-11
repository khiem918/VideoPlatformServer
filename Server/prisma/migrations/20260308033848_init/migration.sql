-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "user_name" VARCHAR(30),
    "user_id" VARCHAR(20) NOT NULL,
    "user_password" VARCHAR(100) NOT NULL,
    "user_phone" VARCHAR(12),
    "user_email" VARCHAR(320),
    "channel_intro" VARCHAR(1000),
    "subscribe_conut" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video" (
    "id" SERIAL NOT NULL,
    "video_name" VARCHAR(1000) NOT NULL,
    "video_released_date" TIMESTAMP,
    "video_view" INTEGER NOT NULL DEFAULT 0,
    "video_like" INTEGER NOT NULL DEFAULT 0,
    "video_dislike" INTEGER NOT NULL DEFAULT 0,
    "user_owner" INTEGER NOT NULL,
    "video_url_storage" VARCHAR(1000) NOT NULL,

    CONSTRAINT "video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hagtag" (
    "id" SERIAL NOT NULL,
    "hagtag_name" VARCHAR(1000) NOT NULL,

    CONSTRAINT "hagtag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_hagtag" (
    "video_id" INTEGER NOT NULL,
    "hagtag_id" INTEGER NOT NULL,

    CONSTRAINT "video_hagtag_pkey" PRIMARY KEY ("video_id","hagtag_id")
);

-- CreateTable
CREATE TABLE "subscribe" (
    "user_id" INTEGER NOT NULL,
    "channel_id" INTEGER NOT NULL,
    "nofify_subscribe" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "subscribe_pkey" PRIMARY KEY ("user_id","channel_id")
);

-- CreateTable
CREATE TABLE "watch_history" (
    "user_id" INTEGER NOT NULL,
    "video_id" INTEGER NOT NULL,
    "paused_at" VARCHAR(8),

    CONSTRAINT "watch_history_pkey" PRIMARY KEY ("user_id","video_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_user_id_key" ON "user"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_user_email_key" ON "user"("user_email");

-- AddForeignKey
ALTER TABLE "video" ADD CONSTRAINT "video_user_owner_fkey" FOREIGN KEY ("user_owner") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_hagtag" ADD CONSTRAINT "video_hagtag_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_hagtag" ADD CONSTRAINT "video_hagtag_hagtag_id_fkey" FOREIGN KEY ("hagtag_id") REFERENCES "hagtag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscribe" ADD CONSTRAINT "subscribe_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscribe" ADD CONSTRAINT "subscribe_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
