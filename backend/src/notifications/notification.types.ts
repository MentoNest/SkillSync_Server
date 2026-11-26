export enum NotificationType {
  MESSAGE = 'message',
  ACCOUNT_SUSPENDED = 'account_suspended',
  ACCOUNT_UNSUSPENDED = 'account_unsuspended',
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  PUSH = 'push',
  EMAIL = 'email',
}

export interface NotifyInput {
  userId: string;
  recipientEmail?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channels?: NotificationChannel[];
}
