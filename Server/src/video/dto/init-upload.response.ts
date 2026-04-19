import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class InitUploadResponse {
  @Field()
  presignedUrl: string;

  @Field()
  uploadId: string;

  @Field()
  videoId : string;
}
