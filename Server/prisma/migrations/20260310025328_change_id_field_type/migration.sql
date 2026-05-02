/*
  Warnings:

  - The primary key for the `hagtag` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `subscribe` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `user_id` on the `subscribe` table. All the data in the column will be lost.
  - The primary key for the `user` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `video` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `video_hagtag` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `watch_history` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `userId` to the `subscribe` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "subscribe" DROP CONSTRAINT "subscribe_channel_id_fkey";

-- DropForeignKey
ALTER TABLE "subscribe" DROP CONSTRAINT "subscribe_user_id_fkey";

-- DropForeignKey
ALTER TABLE "video" DROP CONSTRAINT "video_user_owner_fkey";

-- DropForeignKey
ALTER TABLE "video_hagtag" DROP CONSTRAINT "video_hagtag_hagtag_id_fkey";

-- DropForeignKey
ALTER TABLE "video_hagtag" DROP CONSTRAINT "video_hagtag_video_id_fkey";

-- DropForeignKey
ALTER TABLE "watch_history" DROP CONSTRAINT "watch_history_user_id_fkey";

-- DropForeignKey
ALTER TABLE "watch_history" DROP CONSTRAINT "watch_history_video_id_fkey";

-- AlterTable
ALTER TABLE "hagtag" DROP CONSTRAINT "hagtag_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "hagtag_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "hagtag_id_seq";

-- AlterTable
ALTER TABLE "subscribe" DROP CONSTRAINT "subscribe_pkey",
DROP COLUMN "user_id",
ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "channel_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "subscribe_pkey" PRIMARY KEY ("userId", "channel_id");

-- AlterTable
ALTER TABLE "user" DROP CONSTRAINT "user_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "user_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "user_id_seq";

-- AlterTable
ALTER TABLE "video" DROP CONSTRAINT "video_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "user_owner" SET DATA TYPE TEXT,
ADD CONSTRAINT "video_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "video_id_seq";

-- AlterTable
ALTER TABLE "video_hagtag" DROP CONSTRAINT "video_hagtag_pkey",
ALTER COLUMN "video_id" SET DATA TYPE TEXT,
ALTER COLUMN "hagtag_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "video_hagtag_pkey" PRIMARY KEY ("video_id", "hagtag_id");

-- AlterTable
ALTER TABLE "watch_history" DROP CONSTRAINT "watch_history_pkey",
ALTER COLUMN "user_id" SET DATA TYPE TEXT,
ALTER COLUMN "video_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "watch_history_pkey" PRIMARY KEY ("user_id", "video_id");

-- AddForeignKey
ALTER TABLE "video" ADD CONSTRAINT "video_user_owner_fkey" FOREIGN KEY ("user_owner") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_hagtag" ADD CONSTRAINT "video_hagtag_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_hagtag" ADD CONSTRAINT "video_hagtag_hagtag_id_fkey" FOREIGN KEY ("hagtag_id") REFERENCES "hagtag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscribe" ADD CONSTRAINT "subscribe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscribe" ADD CONSTRAINT "subscribe_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
