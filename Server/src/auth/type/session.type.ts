import { ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Session {
  userId: string;
  refreshToken: string;
  createdAt: string;
}
