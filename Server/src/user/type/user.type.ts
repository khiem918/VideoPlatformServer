import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class UserSign {
  @Field<String>( {nullable: false} )
  userEmail : String;

  @Field<String>({nullable: false})
  userPassword: String;
}


