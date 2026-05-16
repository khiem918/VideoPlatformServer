import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";


@Injectable()
export class SearchRepository {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async keywordSearch(query: string, limit: number): Promise<Array<{ id: string; rank: number }>> {
        return await this.prisma.$queryRaw<Array<{ id: string; rank: number }>>`
            SELECT id, ts_rank_cd(
                to_tsvector('english', "video_name" || ' ' || COALESCE("videoDesc", '')),
                plainto_tsquery('english', ${query})
            ) AS rank
            FROM core.video
            WHERE video_visibility = 'PUBLISHED'
                AND to_tsvector('english', "video_name" || ' ' || COALESCE("videoDesc", ''))
                    @@ plainto_tsquery('english', ${query})
            ORDER BY rank DESC
            LIMIT ${limit}
        `;
    }


    async findManyByIds(ids: string[]) {
        return await this.prisma.video.findMany({
            where: { id: { in: ids }, visibility: 'PUBLISHED' },
            include: {
                owner: {
                    select: {
                        userName: true,
                        id: true,
                    }
                },
            }
        });
    }
}