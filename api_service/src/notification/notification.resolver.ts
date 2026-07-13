import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { NotificationService } from './notification.service';
import { NotificationResponse } from './dto/notification.reponse';

@Resolver()
export class NotificationResolver {
  constructor(private readonly notificationService: NotificationService) {}

  @Query(() => [NotificationResponse])
  // @UseGuards(GqlAuthGuard)
  async getNotification() {
    // @gqlCurrentUser() user: { userId: string },
    return this.notificationService.getNotifications('@jrALUe0g');
  }

  @Mutation(() => Boolean)
  async sendTestNotification(
    @Args('notification_subject') notification_subject: string,
    @Args('payload') payload: string,
    @Args('type') type: string,
  ): Promise<boolean> {
    await this.notificationService.sendNotification(
      '@jrALUe0g',
      notification_subject,
      payload,
      type,
    );
    return true;
  }
}
