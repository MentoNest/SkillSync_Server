import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Observable } from 'rxjs';
import type { Notification } from './entities/notification.entity';

/** In-process fan-out of freshly created notifications to live subscribers (SSE). */
@Injectable()
export class NotificationBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(notification: Notification): void {
    this.emitter.emit(notification.userId, notification);
  }

  stream(userId: string): Observable<Notification> {
    return new Observable<Notification>((subscriber) => {
      const handler = (n: Notification) => subscriber.next(n);
      this.emitter.on(userId, handler);
      return () => this.emitter.off(userId, handler);
    });
  }
}
