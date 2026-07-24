import { Injectable, Logger } from '@nestjs/common';
import { NotificationEvent } from './dto/notificaton.interface';
import { Subject } from 'rxjs';
import { NotificationRepository } from './repository/notification.repository';
import { RedisNotifyService } from './redis.service';

const STREAM_KEY = 'notifications:stream';
const GROUP_NAME = 'notify_wokers';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly subjects = new Map<string, Subject<NotificationEvent>>();

  constructor(
    private readonly NotificationRepository: NotificationRepository,
    private readonly RedisNotifyService: RedisNotifyService,
  ) {}

  subscribe(userId: string): Subject<NotificationEvent> {
    if (!this.subjects.has(userId.toString())) {
      this.subjects.set(userId.toString(), new Subject<NotificationEvent>());
    }
    return this.subjects.get(userId.toString())!;
  }

  unsubscribe(userId: string): void {
    const subject = this.subjects.get(userId.toString());
    if (subject) {
      subject.complete();
      this.subjects.delete(userId.toString());
    }
  }

  pushToUser(event: NotificationEvent): void {
    const subject = this.subjects.get(event.userId.toString());
    if (subject) {
      subject.next(event);
    }
  }

  pushToDedicatedUser(useIds: string[], event: NotificationEvent): void {
    useIds.forEach((userId) => {
      const subject = this.subjects.get(userId.toString());
      if (subject) {
        subject.next(event);
      }
    });
  }

  async sendNotification(
    userId: string,
    notification_subject: string,
    payload: string,
    type: string,
  ) {
    const res = await this.NotificationRepository.createNotification(
      userId,
      notification_subject,
      payload,
      type,
    );
    const targetUserIds =
      await this.NotificationRepository.getSubscribedChannelUserIds(userId);
    await this.RedisNotifyService.publishToRedisStream(
      STREAM_KEY,
      userId,
      payload,
      res.id,
      type,
      notification_subject,
      targetUserIds.map((u) => u.userId).concat([userId]),
    );
  }

  async markAsRead(
    notifyId: string,
    userId: string,
    type: 'SYSTEM' | 'CHANNEL',
  ) {
    await this.NotificationRepository.markAsRead(notifyId, userId, type);
  }

  async getUnread(userId: string) {
    return await this.NotificationRepository.getNotifications(userId);
  }

  async ensureConsumerGroup() {
    await this.RedisNotifyService.ensureConsumerGroup(STREAM_KEY, GROUP_NAME);
  }

  async getNotifications(userId: string) {
    return await this.NotificationRepository.getUnreadNotifications(userId);
  }
}
