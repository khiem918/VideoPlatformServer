import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { NotificationService } from './notification.service';
import { NotificationResponse } from './dto/notification.reponse';
import { GqlAuthGuard } from 'src/auth/guard/gql-auth.guard';
import { gqlCurrentUser } from 'src/auth/decorator/gql-current-user.decorator';

@Resolver()
export class NotificationResolver {
  constructor(private readonly notificationService: NotificationService) {}

  @Query(() => [NotificationResponse])
  @UseGuards(GqlAuthGuard)
  async getNotification(@gqlCurrentUser() user: { userId: string }) {
    return this.notificationService.getNotifications(user.userId);
  }

  @Mutation(() => Boolean)
  @UseGuards(GqlAuthGuard)
  async sendTestNotification(
    @gqlCurrentUser() user: { userId: string },
    @Args('notification_subject') notification_subject: string,
    @Args('payload') payload: string,
    @Args('type') type: string,
  ): Promise<boolean> {
    await this.notificationService.sendNotification(
      user.userId,
      notification_subject,
      payload,
      type,
    );
    return true;
  }

  @Subscription(() => NotificationResponse, {
    resolve: (payload) => payload,
  })
  @UseGuards(GqlAuthGuard)
  onNotification(@gqlCurrentUser() user: { userId: string }) {
    return this.notificationService.subscribe(user.userId).asObservable();
  }
}