import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ShutdownService {
  private readonly logger = new Logger(ShutdownService.name);
  private shuttingDown = false;

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  initiateShutdown(): void {
    this.shuttingDown = true;
    this.logger.log('Shutdown initiated – rejecting new connections');
  }
}
