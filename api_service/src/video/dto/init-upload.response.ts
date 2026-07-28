import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class InitUploadResponse {
  @Field()
  presignedUrl!: string;

  @Field()
  videoId!: string;
}
