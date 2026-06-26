import { Field, ObjectType, Int } from "@nestjs/graphql";

@ObjectType()
export class WatchVideoResponse {
    @Field(() => String)
    id! : string;

    @Field(() => Int)
    duration!: number;

    @Field(() => String)
    videoName!: string;

    @Field(() => BigInt)
    videoView!: number;

    @Field(() => BigInt)
    videoLike!: number;

    @Field(() => BigInt)
    videoDislike!: number;

    @Field(() => String, { nullable: true })
    desc? : string;

    @Field(() => [String], { nullable: true })
    tags?: string[];

    @Field(() => Date)
    createdAt!: Date;

    @Field(() => String)
    ownerId!: string;

    @Field(() => String)
    ownerName!: string;

    @Field(() => BigInt)
    subscriberCount!: number;

    @Field(() => Boolean)
    isSubscribe!: boolean;

    @Field(() => Boolean)
    isLiked!: boolean;
    
    @Field(() => Boolean)
    isDisliked!: boolean;
}

@ObjectType()
export class WatchVideoUrlResponse {
    @Field(() => String)
    mpdUrl!: string;

    @Field(() => String)
    signature!: string; 

    @Field(() => Int)
    expiresAt!: number; 
}


@ObjectType()
export class LikeDislikeResponse {
  @Field(() => BigInt)
  likeCount!: number;

  @Field(() => BigInt)
  dislikeCount!: number; 
}

@ObjectType()
export class SubscribeChannelResponse {
    @Field(() => Boolean)
    isSubscribe!: boolean;
    
    @Field(() => BigInt )
    subscriberCount!: number;
}
