export enum NotificationType {
  MESSAGE = 'message',
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  PUSH = 'push',
}

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channels?: NotificationChannel[];
}
