import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TagService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeTag(tag: string): string {
    return tag
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/-+/g, ' ');
  }

  async handleTags(videoId: string, rawTags: string[]): Promise<void> {
    if (!rawTags || rawTags.length === 0) return;

    const uniqueTagsMap = new Map<string, string>();
    for (const rawTag of rawTags) {
      if (!rawTag || !rawTag.trim()) continue;
      
      const normalized = this.normalizeTag(rawTag);
      if (normalized && !uniqueTagsMap.has(normalized)) {
        uniqueTagsMap.set(normalized, rawTag.trim());
      }
    }

    if (uniqueTagsMap.size === 0) return;

    await this.prisma.$transaction(async (tx) => {
      const videoHashtagsData: { videoId: string; hashtagId: string; displayTag: string }[] = [];

      for (const [normalized, displayTag] of uniqueTagsMap.entries()) {
        const existingHashtag = await tx.hashtag.findUnique({
          where: { normalized: normalized },
        });

        let hashtag: Awaited<ReturnType<typeof tx.hashtag.create>>;

        if (existingHashtag) {
          const newCount = Number(existingHashtag.count) + 1;
          const shouldBeCanonical = newCount > 10;
          
          hashtag = await tx.hashtag.update({
            where: { id: existingHashtag.id },
            data: {
              count: newCount,
              ...(shouldBeCanonical && !existingHashtag.isCanoncial ? { isCanoncial: true } : {}),
            },
          });
        } else {
          hashtag = await tx.hashtag.create({
            data: {
              normalized: normalized,
            },
          });
        }

        videoHashtagsData.push({
          videoId : videoId,
          hashtagId: hashtag.id,
          displayTag: displayTag,
        });
      }

      if (videoHashtagsData.length > 0) {
        await tx.videoHashtag.createMany({
          data: videoHashtagsData,
          skipDuplicates: true,
        });
      }
    });
  }
}
