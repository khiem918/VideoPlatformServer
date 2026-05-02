-- DropForeignKey
ALTER TABLE "video_hashtag" DROP CONSTRAINT "video_hashtag_hashtag_id_fkey";

-- DropForeignKey
ALTER TABLE "video_hashtag" DROP CONSTRAINT "video_hashtag_video_id_fkey";

-- AddForeignKey
ALTER TABLE "video_hashtag" ADD CONSTRAINT "video_hashtag_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_hashtag" ADD CONSTRAINT "video_hashtag_hashtag_id_fkey" FOREIGN KEY ("hashtag_id") REFERENCES "hashtag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
