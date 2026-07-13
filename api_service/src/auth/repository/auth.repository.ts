import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { nanoid } from 'nanoid';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(userEmail: string) {
    try {
      return await this.prisma.user.upsert({
        where: { userEmail },
        update: {},
        create: { id: `@${nanoid(8)}`, userEmail },
        select: { id: true },
      });
    } catch (error) {
      throw new Error('Error occurred while finding user by email');
    }
  }

  async findById(userId: string) {
    try {
      return await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, userEmail: true },
      });
    } catch (error) {
      throw new Error('Error occurred while finding user by ID');
    }
  }
}

