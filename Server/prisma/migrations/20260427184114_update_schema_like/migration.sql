-- CreateTable
CREATE TABLE "like_video" (
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "isLike" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "like_video_pkey" PRIMARY KEY ("userId","videoId")
);

-- AddForeignKey
ALTER TABLE "like_video" ADD CONSTRAINT "like_video_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "like_video" ADD CONSTRAINT "like_video_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
