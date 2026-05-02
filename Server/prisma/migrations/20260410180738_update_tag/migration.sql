/*
  Warnings:

  - Added the required column `displayName` to the `hashtag_alias` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "hashtag_alias" ADD COLUMN     "displayName" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "hashtag_pending" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hashtag_pending_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hashtag_pending_displayName_key" ON "hashtag_pending"("displayName");
