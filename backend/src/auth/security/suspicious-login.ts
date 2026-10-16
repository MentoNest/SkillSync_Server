/**
 * Extension points for suspicious-login detection. Detectors inspect a login attempt and return
 * signals; handlers react to them (alert, step-up, audit). Nothing here blocks a login by itself.
 */
export const SUSPICIOUS_LOGIN_DETECTORS = 'SUSPICIOUS_LOGIN_DETECTORS';
export const SUSPICIOUS_LOGIN_HANDLERS = 'SUSPICIOUS_LOGIN_HANDLERS';

export interface LoginAttempt {
  userId: string;
  walletAddress: string;
  ipAddress: string | null;
  userAgent: string | null;
  at: Date;
}

export interface SuspicionSignal {
  type: 'new_device' | 'new_ip' | 'impossible_travel' | 'rapid_attempts' | 'custom';
  severity: 'low' | 'medium' | 'high';
  reason: string;
}

export interface SuspiciousLoginDetector {
  detect(attempt: LoginAttempt): Promise<SuspicionSignal[]>;
}

export interface SuspiciousLoginHandler {
  handle(attempt: LoginAttempt, signals: SuspicionSignal[]): Promise<void>;
}
