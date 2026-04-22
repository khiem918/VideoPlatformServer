import { Field, ObjectType } from "@nestjs/graphql";


@ObjectType()
export class WatchVideoResponse {
    @Field(() => String)
    id : string;

    @Field(() => Number)
    duration: Number;

    @Field(() => String)
    videoUrl: string;

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
}