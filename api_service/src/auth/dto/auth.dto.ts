import { Field, InputType } from "@nestjs/graphql";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

@InputType()
export class SignInInput { 
    @Field()
    @IsNotEmpty()
    @IsString()
    @MaxLength(5000)
    clientId: string;
}