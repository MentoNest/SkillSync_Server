import { Injectable, Logger } from '@nestjs/common';

export interface SessionExtension {
  sessionId: string;
  extraMinutes: number;
  requestedBy: string;
}

@Injectable()
export class ExtensionPauseService {
  private readonly logger = new Logger(ExtensionPauseService.name);
  private readonly extensions = new Map<string, SessionExtension>();
  private isPaused: boolean = false;

  /**
   * Manages session time extensions requested by mentors or mentees.
   */
  public requestSessionExtension(sessionId: string, requestedBy: string, extraMinutes: number): SessionExtension {
    const extension: SessionExtension = {
      sessionId,
      extraMinutes,
      requestedBy,
    };
    this.extensions.set(sessionId, extension);
    this.logger.log(`Session ${sessionId} extended by ${extraMinutes} mins by ${requestedBy}`);
    return extension;
  }

  /**
   * Triggers or clears emergency pause state for system protection.
   */
  public setEmergencyPauseState(paused: boolean): boolean {
    this.isPaused = paused;
    this.logger.warn(`Emergency pause state changed to: ${paused}`);
    return this.isPaused;
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }
}
