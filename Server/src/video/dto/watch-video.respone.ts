import { Field, FIELD_TYPENAME, ObjectType, Int } from "@nestjs/graphql";


@ObjectType()
export class WatchVideoResponse {
    @Field(() => String)
    id : string;

    @Field(() => Number)
    duration: Number;

    @Field(() => String)
    videoName: string;

    @Field(() => Number)
    videoView : number;

    @Field(() => Number)
    videoLike : number;

    @Field(() => Number)
    videoDislike : number;

    @Field(() => String, { nullable: true })
    desc? : string;

    @Field(() => [String], { nullable: true })
    tags?: string[];

    @Field(() => Date)
    createdAt: Date;

    @Field(() => String)
    ownerId: string;

    @Field(() => String)
    ownerName: string;

    @Field(() => Number)
    subscriberCount: number;

    @Field(() => Boolean)
    isSubscribe: boolean;

    @Field(() => Boolean)
    isLiked: boolean;
    
    @Field(() => Boolean)
    isDisliked: boolean;
}

@ObjectType()
export class WatchVideoUrlResponse {
    @Field(() => String)
    mpdUrl : string;

    @Field(() => String)
    signature : string; 

    @Field(() => Number)
    expiresAt : number; 
}


@ObjectType()
export class LikeDislikeResponse {
  @Field(() => BigInt)
  likeCount: bigint;

  @Field(() => BigInt)
  dislikeCount: bigint; 
}

@ObjectType()
export class SubscribeChannelResponse {
    @Field(() => Boolean)
    isSubscribe: boolean;
    
    @Field(() => BigInt)
    subscriberCount: bigint;
}
