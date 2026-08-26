import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { HttpServer } from '@nestjs/common/interfaces';
import { NestApplication } from '@nestjs/core';

export interface ShutdownConfig {
  timeout: number; // milliseconds
  healthCheckPath: string;
  forceShutdownTimeout: number;
}

export interface ShutdownState {
  isShuttingDown: boolean;
  startTime?: Date;
  connectionsDrained: number;
  requestsCompleted: number;
  requestsInFlight: number;
}

@Injectable()
export class GracefulShutdownService implements OnModuleDestroy {
  private readonly logger = new Logger(GracefulShutdownService.name);
  private readonly config: ShutdownConfig;
  private readonly state: ShutdownState = {
    isShuttingDown: false,
    connectionsDrained: 0,
    requestsCompleted: 0,
    requestsInFlight: 0,
  };

  private app: NestApplication | null = null;
  private server: HttpServer | null = null;
  private shutdownHandlers: Array<() => Promise<void>> = [];
  private forceShutdownTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.config = {
      timeout: parseInt(process.env.SHUTDOWN_TIMEOUT || '30000', 10),
      healthCheckPath: process.env.HEALTH_CHECK_PATH || '/health',
      forceShutdownTimeout: parseInt(process.env.FORCE_SHUTDOWN_TIMEOUT || '60000', 10),
    };
  }

  /**
   * Initialize graceful shutdown with the NestJS application
   */
  initialize(app: NestApplication): void {
    this.app = app;
    this.server = app.getHttpServer();

    // Register signal handlers
    process.on('SIGTERM', () => this.handleSignal('SIGTERM'));
    process.on('SIGINT', () => this.handleSignal('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception during shutdown', error);
      this.forceShutdown();
    });

    this.logger.log('Graceful shutdown handlers initialized');
  }

  /**
   * Register custom shutdown handlers
   */
  registerShutdownHandler(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler);
  }

  /**
   * Handle shutdown signals (SIGTERM, SIGINT)
   */
  private async handleSignal(signal: string): Promise<void> {
    if (this.state.isShuttingDown) {
      this.logger.warn(`Received ${signal} during shutdown, forcing...`);
      this.forceShutdown();
      return;
    }

    this.logger.log(`Received ${signal}, starting graceful shutdown...`);
    this.state.isShuttingDown = true;
    this.state.startTime = new Date();

    // Start force shutdown timer
    this.forceShutdownTimer = setTimeout(() => {
      this.logger.error('Force shutdown timeout reached');
      this.forceShutdown();
    }, this.config.forceShutdownTimeout);

    try {
      await this.performShutdown();
    } catch (error) {
      this.logger.error('Error during graceful shutdown', error);
      this.forceShutdown();
    }
  }

  /**
   * Perform the graceful shutdown sequence
   */
  private async performShutdown(): Promise<void> {
    const steps = [
      { name: 'Stop accepting new connections', fn: () => this.stopAcceptingConnections() },
      { name: 'Wait for in-flight requests', fn: () => this.drainInFlightRequests() },
      { name: 'Execute custom shutdown handlers', fn: () => this.executeShutdownHandlers() },
      { name: 'Close HTTP server', fn: () => this.closeHttpServer() },
    ];

    for (const step of steps) {
      this.logger.log(`Shutdown step: ${step.name}`);
      try {
        await Promise.race([
          step.fn(),
          this.createTimeout(this.config.timeout / steps.length),
        ]);
      } catch (error) {
        this.logger.warn(`Shutdown step failed: ${step.name}`, error);
      }
    }

    this.logger.log('Graceful shutdown completed');
    this.clearShutdownTimer();
    process.exit(0);
  }

  /**
   * Stop accepting new connections
   */
  private async stopAcceptingConnections(): Promise<void> {
    if (!this.server) return;

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.logger.log('HTTP server stopped accepting connections');
        resolve();
      });
    });
  }

  /**
   * Wait for in-flight requests to complete
   */
  private async drainInFlightRequests(): Promise<void> {
    const startTime = Date.now();
    const timeout = this.config.timeout / 2;

    while (this.state.requestsInFlight > 0 && Date.now() - startTime < timeout) {
      this.logger.debug(`Waiting for ${this.state.requestsInFlight} in-flight requests...`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this.state.requestsInFlight > 0) {
      this.logger.warn(`${this.state.requestsInFlight} requests still in flight after timeout`);
    }
  }

  /**
   * Execute custom shutdown handlers
   */
  private async executeShutdownHandlers(): Promise<void> {
    for (const handler of this.shutdownHandlers) {
      try {
        await handler();
      } catch (error) {
        this.logger.error('Shutdown handler failed', error);
      }
    }
  }

  /**
   * Close the HTTP server
   */
  private async closeHttpServer(): Promise<void> {
    if (!this.app) return;

    await this.app.close();
    this.logger.log('NestJS application closed');
  }

  /**
   * Force immediate shutdown
   */
  private forceShutdown(): void {
    this.logger.error('Force shutdown initiated');
    this.clearShutdownTimer();
    process.exit(1);
  }

  /**
   * Create a timeout promise
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Shutdown timeout')), ms);
    });
  }

  /**
   * Clear the force shutdown timer
   */
  private clearShutdownTimer(): void {
    if (this.forceShutdownTimer) {
      clearTimeout(this.forceShutdownTimer);
      this.forceShutdownTimer = null;
    }
  }

  /**
   * Increment in-flight request count
   */
  trackRequest(): void {
    this.state.requestsInFlight++;
  }

  /**
   * Decrement in-flight request count
   */
  completeRequest(): void {
    this.state.requestsInFlight--;
    this.state.requestsCompleted++;
  }

  /**
   * Get current shutdown state
   */
  getState(): Readonly<ShutdownState> {
    return { ...this.state };
  }

  /**
   * Health check endpoint handler
   * Returns 503 during shutdown
   */
  healthCheck(): { status: string; uptime?: number } {
    if (this.state.isShuttingDown) {
      return { status: 'shutting_down' };
    }
    return {
      status: 'ok',
      uptime: process.uptime(),
    };
  }

  onModuleDestroy() {
    this.clearShutdownTimer();
  }
}
