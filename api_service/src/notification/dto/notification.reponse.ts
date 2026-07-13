import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class NotificationResponse {
  @Field(() => String)
  id: string;

  @Field(() => String)
  content: string;

  @Field(() => Boolean)
  isRead: boolean;
}
