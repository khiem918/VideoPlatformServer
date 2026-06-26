import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const DB_URL = process.env.DATABASE_URL;
    const adapter = new PrismaPg({ connectionString: DB_URL });
    super({ adapter });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      await this.$queryRaw`SELECT 1`;
      console.log('Connected to database successfully');
    } catch (error) {
      console.error('Prisma database connection failed', error as Error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
