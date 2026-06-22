import { ObjectType, Field, Int } from '@nestjs/graphql';

@ObjectType()
export class UserVideoResponse {
  @Field(() => String)
  id: string;

  @Field(() => String, { nullable: true })
  videoName?: string;

  @Field(() => Int)
  duration: number;

  @Field(() => String, { nullable: true })
  videoUrl?: string;

  @Field(() => String, { nullable: true })
  thumbnailUrl?: string;

  @Field(() => BigInt)
  videoView: bigint;

  @Field(() => Int)
  videoLike: number;

  @Field(() => Int)
  videoDislike: number;

  @Field(() => String)
  visibility: string;

  @Field(() => String, { nullable: true })
  rawDesc?: string;

  @Field(() => [String], { nullable: true })
  tags?: string[];

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;
}

@ObjectType()
export class UserVideosListResponse {
  @Field(() => Int)
  total: number;

  @Field(() => [UserVideoResponse])
  videos: UserVideoResponse[];
}

