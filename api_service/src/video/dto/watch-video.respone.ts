import { Field, ObjectType, Int } from "@nestjs/graphql";

@ObjectType()
export class WatchVideoResponse {
    @Field(() => String)
    id! : string;

    @Field(() => Int)
    duration!: number;

    @Field(() => String)
    videoName!: string;

    @Field(() => Int)
    videoView!: number;

    @Field(() => Int)
    videoLike!: number;

    @Field(() => Int)
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

    @Field(() => Int)
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
  @Field(() => Int)
  likeCount!: number;

  @Field(() => Int)
  dislikeCount!: number; 
}

@ObjectType()
export class SubscribeChannelResponse {
    @Field(() => Boolean)
    isSubscribe!: boolean;
    
    @Field(() => Int )
    subscriberCount!: number;
}
