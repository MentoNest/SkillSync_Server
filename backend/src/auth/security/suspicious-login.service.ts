import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  LoginAttempt,
  SUSPICIOUS_LOGIN_DETECTORS,
  SUSPICIOUS_LOGIN_HANDLERS,
  SuspiciousLoginDetector,
  SuspiciousLoginHandler,
} from './suspicious-login';

@Injectable()
export class SuspiciousLoginService {
  private readonly logger = new Logger(SuspiciousLoginService.name);

  constructor(
    @Optional() @Inject(SUSPICIOUS_LOGIN_DETECTORS) private readonly detectors: SuspiciousLoginDetector[] = [],
    @Optional() @Inject(SUSPICIOUS_LOGIN_HANDLERS) private readonly handlers: SuspiciousLoginHandler[] = [],
  ) {}

  /** Call after a successful login. Never throws: detection must not block authentication. */
  async evaluate(attempt: LoginAttempt): Promise<void> {
    try {
      const results = await Promise.all(this.detectors.map((d) => d.detect(attempt)));
      const signals = results.flat();
      if (!signals.length) return;
      this.logger.warn(`Suspicious login for user ${attempt.userId}: ${signals.map((s) => s.type).join(', ')}`);
      await Promise.all(this.handlers.map((h) => h.handle(attempt, signals)));
    } catch (err) {
      this.logger.error(`Suspicious login evaluation failed: ${(err as Error).message}`);
    }
  }
}
