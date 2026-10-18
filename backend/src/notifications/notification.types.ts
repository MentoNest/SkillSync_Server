export enum NotificationType {
  SESSION_REMINDER = 'session_reminder',
  MESSAGE = 'message',
  PROFILE_VERIFICATION = 'profile_verification',
  SUSPENSION_WARNING = 'suspension_warning',
  ANNOUNCEMENT = 'announcement',
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  PUSH = 'push',
}

/** Types users cannot opt out of (safety / account standing). */
export const MANDATORY_TYPES: readonly NotificationType[] = [NotificationType.SUSPENSION_WARNING];

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Defaults to in-app only; email and push are placeholders. */
  channels?: NotificationChannel[];
}

export const DEFAULT_RETENTION_DAYS = 90;
