import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { TagService } from './tag.service';

@Module({
  imports: [PrismaModule],
  providers: [TagService],
  exports: [TagService],
})
export class TagModule {}
