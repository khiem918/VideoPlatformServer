import { Injectable, Logger } from "@nestjs/common";
import { EmbedClient } from "src/embed/embedservice/embed.client";
import { QdrantService } from "src/qdrant/qdrant.service";
import { S3Service } from "src/s3/s3.service";
import { SearchRepository } from "./repository/search.reposiroty";
import * as fs from 'fs';

@Injectable()
export class SearchService {
    private readonly logger = new Logger(SearchService.name);
    constructor(
        private readonly qdrantService: QdrantService,
        private readonly searchrepository: SearchRepository,
        private readonly embedClient: EmbedClient,
        private readonly s3Service: S3Service,
    ) { }

    async searchVideos(_userId: string, query: string, limit: number = 10, offset: number = 0) {
        const KEYWORD_WEIGHT = 0.4;
        const VECTOR_WEIGHT = 0.6;
        const candidateLimit = Math.max(limit * 5, 50);

        const keywordResultsPromise = this.searchrepository.keywordSearch(query, candidateLimit);

        const queryVector = await this.embedClient.generateQueryVector(query);

        const [vectorHits, keywordResults] = await Promise.all([
            this.qdrantService.vectorSearch({
                denseVector: queryVector,
                limit: candidateLimit,
                prefetchLimit: candidateLimit * 2,

            }),
            keywordResultsPromise,
        ]);

        fs.writeFileSync('test.json', JSON.stringify(vectorHits, null, 2));
        fs.writeFileSync('test2.json', JSON.stringify(keywordResults, null, 2));

        const maxKw = keywordResults.reduce((m, r) => Math.max(m, r.rank), 0) || 1;
        const maxVec = vectorHits.reduce((m, h) => Math.max(m, h.score), 0) || 1;

        const scoreMap = new Map<string, { kw: number; vec: number; type: string }>();

        for (const r of keywordResults) {
            if (r.rank / maxKw < 0.5) {
                continue;
            }
            scoreMap.set(r.id, { kw: r.rank / maxKw, vec: 0, type: "KEYWORD" });
        }

        for (const hit of vectorHits) {
            const videoId = hit.payload.videoId as string | undefined;
            if (!videoId) {
                this.logger.warn(`Vector hit ${hit.id} is missing videoId in payload, skipping`);
                continue;
            }
            const entry = scoreMap.get(videoId) ?? { kw: 0, vec: 0, type: "VECTOR" };
            const score = hit.score / maxVec;

            if (score < 0.5) {
                continue;
            }

            entry.vec = score;
            scoreMap.set(videoId, entry);
        }

        const ranked = Array.from(scoreMap.entries())
            .map(([videoId, scores]) => ({
                videoId,
                type: scores.type,
                finalScore: KEYWORD_WEIGHT * scores.kw + VECTOR_WEIGHT * scores.vec,
            }))
            .sort((a, b) => b.finalScore - a.finalScore);

        const total = ranked.length;
        const page = ranked.slice(offset, offset + limit);

        fs.writeFileSync('test3.json', JSON.stringify(page, null, 2));

        const videos = await this.searchrepository.findManyByIds(page.map((r) => r.videoId));
        const videoMap = new Map(videos.map((v) => [v.id, v]));

        const resultsRaw = await Promise.all(
            page.map(async (r) => {
                const v = videoMap.get(r.videoId);
                if (!v) return null;

                if (v.thumbnailUrl) {
                    try {
                        v.thumbnailUrl = await this.s3Service.getPresignedDownloadUrl(v.thumbnailUrl, 3600);
                    } catch (error) {
                        console.error(`Failed to get presigned URL for thumbnail ${v.thumbnailUrl}:`, error);
                    }
                }
                return {
                    id: v.id,
                    videoName: v.videoName,
                    thumbnailUrl: v.thumbnailUrl,
                    duration: v.duration,
                    videoView: v.videoView,
                    rawDesc: v.videoDesc,
                    updatedAt: v.updatedAt,
                    ownerName: v.owner.userName ? v.owner.userName : v.owner.id,
                };
            })
        );

        return { results: resultsRaw.filter(Boolean), total };
    }
}
