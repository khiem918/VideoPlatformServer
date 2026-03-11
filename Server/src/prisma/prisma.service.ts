import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
    extends PrismaClient
    implements OnModuleInit, OnModuleDestroy
{
    constructor() {
        const adapter = new PrismaPg({ url: process.env.DATABASE_URL });
        super({ adapter });
    }

    async onModuleInit() {
        await this.$connect();
        console.log('Connected to the database');
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}
