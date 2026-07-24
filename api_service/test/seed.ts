import * as dotenv from 'dotenv';
const fs = require('fs');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmbedQueueService } from 'src/embed/embed.queue';
import { SemanticProcessingService } from '../src/semantic-processing/semantic-processing.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { QdrantClient } from '@qdrant/js-client-rest';
import { v4 as uuidv4 } from 'uuid';


const filePath = path.join(__dirname, 'test_data.json');

const testData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let semanticProcessingService: SemanticProcessingService;
let embedQueueService: EmbedQueueService;
let prisma: PrismaService;

// async function seedDatabase() {
//   const app = await NestFactory.create(AppModule);
//   semanticProcessingService = app.get(SemanticProcessingService);
//   embedQueueService = app.get(EmbedQueueService);
//   prisma = app.get(PrismaService);

//   for (const video of testData) {           

//     const processedDescription = await semanticProcessingService.processingDescription(video.video_description);
//     const summarizedDescription = await semanticProcessingService.summarizeDescription(processedDescription);

//     const videoid = uuidv4();

//     try {
//       await embedQueueService.addEmbedJob({
//         videoId: videoid,
//         userOwner: "@jrALUe0g",
//         title: await semanticProcessingService.normalizeText(video.video_title),
//         description: summarizedDescription,
//         createdAt: Date.now(),
//       });
//     } catch (error) {
//       console.error(`Failed to enqueue embedding job for video ${videoid}:`, error);
//     }

//     const videoUpload = await prisma.videoUpload.create({
//       data: {
//         id: uuidv4(),
//         userId: "@jrALUe0g",
//         fileName: "04144f26-7861-44d6-9c9e-5454217682c4.mp4",
//         fileSize: 123456789,
//         mimeType: "video/mp4",
//         r2Path: `uploads/${uuidv4()}.mp4`,
//         status: "COMPLETED",
//       }
//     });

//     await prisma.video.create({
//       data: {
//         id: videoid,
//         videoName: video.video_title,
//         videoDesc: processedDescription,
//         rawDesc: video.video_description,
//         videoUrl: "videos/65/a2/04144f26-7861-44d6-9c9e-5454217682c4/dash/manifest.mpd",
//         visibility: 'PUBLISHED',
//         userOwner: "@jrALUe0g",
//         uploadId: videoUpload.id,
//         thumbnailUrl: "videos/65/a2/04144f26-7861-44d6-9c9e-5454217682c4/thumb/0.jpg",
//       }
//     });
//     console.log(`Inserted video: ${video.video_title}`);
//     await new Promise(resolve => setTimeout(resolve, 1000));
//   }

//   console.log('Database seeding completed!');
//   await prisma.$disconnect();
//   await app.close();
// }


// seedDatabase().catch((error) => {
//   console.error('Error seeding database:', error);
//   process.exit(1);
// });


async function cleanupQdrantOrphanedVideos(dryRun: boolean = true) {
  const app = await NestFactory.create(AppModule);
  prisma = app.get(PrismaService);

  const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    checkCompatibility: false,
  });

  const COLLECTION_NAME = 'videos';
  const BATCH_SIZE = 100; 
  const PAGE_SIZE = 100; 

  try {
    console.log('\nStarting Qdrant Cleanup...');
    console.log(
      `Mode: ${dryRun ? 'DRY RUN (No changes will be made)' : 'EXECUTION (Records will be deleted)'}\n`,
    );

    console.log('Fetching Qdrant Collection Statistics...');
    const collection = await qdrantClient.getCollection(COLLECTION_NAME);
    console.log(`Collection: ${COLLECTION_NAME}`);
    console.log(`Total Points: ${collection.points_count}`);
    console.log(`Indexed Vectors: ${collection.indexed_vectors_count ?? 0}\n`);

    console.log('Processing points from Qdrant...\n');
    const orphanedIds: string[] = [];
    const errors: Array<{ videoId: string; error: string }> = [];
    let deletedCount = 0;
    let processedCount = 0;
    let pointIdOffset: string | null = null;

    while (true) {
      const response = await qdrantClient.scroll(COLLECTION_NAME, {
        limit: PAGE_SIZE,
        offset: pointIdOffset || 0,
        with_payload: true,
      });

      if (!response.points || response.points.length === 0) {
        console.log('No more points to process.');
        break;
      }

      processedCount += response.points.length;
      console.log(`Processing batch of ${response.points.length} points (Total: ${processedCount})...`);

      const pageVideoIds = response.points.map((point) => {
        const payload = point.payload as { videoId?: string };
        return {
          pointId: point.id,
          videoId: payload?.videoId || String(point.id),
        };
      });

      for (let i = 0; i < pageVideoIds.length; i += BATCH_SIZE) {
        const batch = pageVideoIds.slice(i, i + BATCH_SIZE);
        const videoIds = batch.map((item) => item.videoId);

        const existingVideos = await prisma.video.findMany({
          where: {
            id: {
              in: videoIds,
            },
          },
          select: {
            id: true,
          },
        });

        const existingVideoIdSet = new Set(existingVideos.map((v) => v.id));

        const orphanedInBatch = batch.filter(
          (item) => !existingVideoIdSet.has(item.videoId),
        );

        for (const orphaned of orphanedInBatch) {
          orphanedIds.push(orphaned.videoId);

          if (!dryRun) {
            try {
              await qdrantClient.delete(COLLECTION_NAME, {
                wait: true,
                points: [orphaned.pointId],
              });
              deletedCount++;
              console.log(`Deleted: ${orphaned.videoId}`);
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              errors.push({
                videoId: orphaned.videoId,
                error: errorMessage,
              });
              console.log(
                `Failed to delete ${orphaned.videoId}: ${errorMessage}`,
              );
            }
          }
        }
      }

      if (response.points.length < PAGE_SIZE) {
        break;
      }

      pointIdOffset = String(response.points[response.points.length - 1].id);
    }

    console.log('\n✅ Cleanup Completed!');
    console.log(`Total objects processed: ${processedCount}`);
    console.log(`Orphaned objects found: ${orphanedIds.length}`);
    console.log(`Objects deleted: ${deletedCount}`);

    if (orphanedIds.length > 0) {
      console.log(`\n📋 Orphaned Video IDs:`);
      orphanedIds.forEach((id, index) => {
        console.log(`  ${index + 1}. ${id}`);
      });
    }

    if (errors.length > 0) {
      console.log(`\n⚠️ Errors occurred during deletion:`);
      errors.forEach((error) => {
        console.log(`  - ${error.videoId}: ${error.error}`);
      });
    }

    if (dryRun && orphanedIds.length > 0) {
      console.log(
        '\n💡Tip: Run with dryRun=false to actually delete orphaned records.\n',
      );
    }

    await prisma.$disconnect();
    await app.close();
  } catch (error) {
    console.error('Error during cleanup:', error);
    await prisma.$disconnect();
    await app.close();
    process.exit(1);
  }
}




cleanupQdrantOrphanedVideos(false).catch((error) => {
  console.error('Error during Qdrant cleanup:', error);
  process.exit(1);
});

