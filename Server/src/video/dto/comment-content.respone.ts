import { Field, ObjectType } from "@nestjs/graphql";

@ObjectType()
export class CommentContentResponse {
    @Field(() => String)
    id: string;

    @Field(() => String)
    content: string;

    @Field(() => Date)
    createdAt: Date;

    @Field(() => String)
    ownerName: string;

    @Field(() => Number)
    likeCount?: number;

    @Field(() => Number)
    replyCount?: number;
}