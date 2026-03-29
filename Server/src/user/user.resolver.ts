import { Resolver, Query } from '@nestjs/graphql';
import { UserService } from './user.service';
import { UserSign } from './type/user.type';

@Resolver(() => UserSign)
export class UserResolver {
  constructor(private readonly userService: UserService) {}

  @Query(() => String)
  hello() {
    return 'hello';
  }
}
