/*
  Warnings:

  - You are about to drop the `notification` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "notification" DROP CONSTRAINT "notification_userId_fkey";

-- DropTable
DROP TABLE "notification";

-- CreateTable
CREATE TABLE "channel_notification" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "system_notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channel_notification_channelId_idx" ON "channel_notification"("channelId");

-- CreateIndex
CREATE INDEX "system_notification_userId_idx" ON "system_notification"("userId");

-- AddForeignKey
ALTER TABLE "channel_notification" ADD CONSTRAINT "channel_notification_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_notification" ADD CONSTRAINT "system_notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
