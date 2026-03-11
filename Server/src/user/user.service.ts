import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { nanoid } from 'nanoid'
import { v4 as uuid } from 'uuid';

@Injectable()
export class UserService {
  constructor(private prisma : PrismaService) {}


  async findByEmail(userEmail: string) {
    return this.prisma.user.upsert({
      where: { userEmail },
      update: {},
      create: { id: `@${nanoid(8)}`, userEmail, userPassword: uuid() },
      select: { id: true },
    });
  }
}

