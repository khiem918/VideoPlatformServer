import { Controller, Param, Sse, MessageEvent, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { finalize, Observable, map } from 'rxjs';
import { RestAuthGuard } from 'src/auth/guard/rest-auth.guard';
import { restCurrentUser } from 'src/auth/decorator/rest-current-user.decorator';

@Controller()
export class NotificationController {
    constructor(
        private notificationService: NotificationService
    ) { }

    @UseGuards(RestAuthGuard)
    @Sse('stream/:token')
    stream(@restCurrentUser() user: { userId: string } ) : Observable<MessageEvent> {
        const subject = this.notificationService.subscribe(user.userId);
        
        console.log(`User ${user.userId} subscribed to notifications`);

        return subject.asObservable().pipe(
            map((event) => ({
                data: JSON.stringify(event),
                type: 'notification',
                id : event.id,
            } as MessageEvent )), 
            finalize(() => {
                this.notificationService.unsubscribe(user.userId);
            })
        );
    }

    
}
