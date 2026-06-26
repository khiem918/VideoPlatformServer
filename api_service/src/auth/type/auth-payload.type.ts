import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AuthPayload {
  @Field()
  user_id: string;

  @Field()
  accessToken: string;
}
