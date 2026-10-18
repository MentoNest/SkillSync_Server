import { Injectable } from '@nestjs/common';

/**
 * Tracks whether the process is shutting down (issue #1483). The health
 * endpoint reports 503 and new requests are refused while this is set.
 */
@Injectable()
export class ShutdownService {
  private shuttingDown = false;

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  begin(): void {
    this.shuttingDown = true;
  }
}
