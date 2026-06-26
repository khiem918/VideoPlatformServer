import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchResolver } from './search.resolver';
import { SearchRepository } from './repository/search.reposiroty';
import { QdrantModule } from 'src/qdrant/qdrant.module';
import { EmbedModule } from 'src/embed/embed.module';
import { S3Service } from 'src/s3/s3.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  imports: [QdrantModule, EmbedModule],
  providers: [SearchService, SearchResolver, SearchRepository, S3Service, PrismaService],
  exports: [SearchService],
})
export class SearchModule {}
