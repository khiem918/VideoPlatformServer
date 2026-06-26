import { Field, InputType } from "@nestjs/graphql";

@InputType()
export class NotificationInput {
    @Field(() => String)
    userId: string

    @Field(() => String)
    notification_subject: string;

    @Field(() => String)
    payload: string;

    @Field(() => String)
    type: string;
}