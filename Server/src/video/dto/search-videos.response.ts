import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class SearchVideoItem {
  @Field(() => String)
  id: string;

  @Field(() => String)
  videoName?: string;

  @Field(() => String, { nullable: true })
  thumbnailUrl?: string;

  @Field(() => Int)
  duration: number;

  @Field(() => Int)
  videoView: number;

  @Field(() => String, { nullable: true })
  rawDesc?: string;

  @Field(() => Date)
  updatedAt: Date;

  @Field(() => String)
  ownerName : string;

}

@ObjectType()
export class SearchVideosResponse {
  @Field(() => [SearchVideoItem])
  results: SearchVideoItem[];

  @Field(() => Int)
  total: number;
}

