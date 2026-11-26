import { Injectable, Logger } from '@nestjs/common';

/** Default grace period: in-flight requests get 30 seconds to finish. */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30_000;

/** Signals that start a graceful shutdown. */
export const SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = [
  'SIGTERM',
  'SIGINT',
];

/** A cleanup step run during shutdown (close file handles, flush logs, ...). */
export type ShutdownHook = () => void | Promise<void>;

/** Terminates the process; injectable so tests can observe the exit code. */
export type ExitFunction = (code: number) => void;

export interface ShutdownServiceOptions {
  /** How long to wait for in-flight work before forcing an exit. Defaults to 30 seconds. */
  timeoutMs?: number;
  /** Process terminator. Defaults to `process.exit`. */
  exit?: ExitFunction;
}

interface RegisteredHook {
  name: string;
  run: ShutdownHook;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Coordinates a graceful shutdown when the process receives `SIGTERM` or `SIGINT`.
 *
 * The sequence is:
 *  1. mark the server as shutting down so the health check answers `503` and new
 *     requests are rejected (see `createShutdownMiddleware`);
 *  2. arm a force-exit timer (the configured timeout, 30 seconds by default);
 *  3. close the application - this stops the HTTP server from accepting connections
 *     and disposes the database and Redis connections through the Nest lifecycle hooks;
 *  4. run the registered cleanup hooks (file handles, log flushing, ...);
 *  5. exit with code `0`, or `1` when the timeout or an error is hit first.
 */
@Injectable()
export class ShutdownService {
  private readonly logger = new Logger(ShutdownService.name);
  private readonly timeoutMs: number;
  private readonly exit: ExitFunction;

  private shuttingDown = false;
  private completed = false;
  private shutdownPromise?: Promise<void>;
  private closeHandler?: ShutdownHook;
  private readonly hooks: RegisteredHook[] = [];
  private readonly listeners: Array<{
    signal: NodeJS.Signals;
    handler: () => void;
  }> = [];

  constructor(options: ShutdownServiceOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
    this.exit = options.exit ?? ((code) => process.exit(code));
  }

  /** Grace period in milliseconds before a forced exit. */
  get timeout(): number {
    return this.timeoutMs;
  }

  /** True from the moment a signal is received until the process exits. */
  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  /** True once every resource was released and the application closed cleanly. */
  isShutdownComplete(): boolean {
    return this.completed;
  }

  /** Registers the operation that closes the Nest application (HTTP server, DB, Redis). */
  onClose(handler: ShutdownHook): void {
    this.closeHandler = handler;
  }

  /** Registers an extra cleanup hook executed after the application has closed. */
  registerHook(name: string, hook: ShutdownHook): void {
    this.hooks.push({ name, run: hook });
  }

  /**
   * Attaches the `SIGTERM`/`SIGINT` handlers. Idempotent, so a signal is never
   * handled twice. Call `removeListeners()` to detach them again.
   */
  listen(signals: readonly NodeJS.Signals[] = SHUTDOWN_SIGNALS): void {
    for (const signal of signals) {
      if (this.listeners.some((entry) => entry.signal === signal)) continue;
      const handler = () => {
        void this.shutdown(signal);
      };
      process.on(signal, handler);
      this.listeners.push({ signal, handler });
    }
    if (this.listeners.length > 0) {
      this.logger.log(
        `Listening for shutdown signals: ${this.listeners.map((entry) => entry.signal).join(', ')}`,
      );
    }
  }

  /** Detaches every handler previously attached by `listen()`. */
  removeListeners(): void {
    for (const { signal, handler } of this.listeners) {
      process.removeListener(signal, handler);
    }
    this.listeners.length = 0;
  }

  /**
   * Starts the shutdown. Safe to call more than once: concurrent calls share the
   * same promise so the resources are only released once.
   */
  shutdown(signal: string): Promise<void> {
    if (this.shutdownPromise) {
      this.logger.warn(`Shutdown already in progress; ignoring ${signal}.`);
      return this.shutdownPromise;
    }

    this.shuttingDown = true;
    this.logger.log(
      `Received ${signal}. Starting graceful shutdown (timeout ${this.timeoutMs}ms)...`,
    );
    this.shutdownPromise = this.run();
    return this.shutdownPromise;
  }

  private async run(): Promise<void> {
    const forceTimer = setTimeout(() => {
      this.logger.error(
        `Graceful shutdown did not finish within ${this.timeoutMs}ms; forcing exit with code 1.`,
      );
      this.exit(1);
    }, this.timeoutMs);

    try {
      await this.closeApplication();
      await this.runHooks();
      clearTimeout(forceTimer);
      this.completed = true;
      this.logger.log('Graceful shutdown complete.');
      this.exit(0);
    } catch (error) {
      clearTimeout(forceTimer);
      this.logger.error(`Graceful shutdown failed: ${describe(error)}`);
      this.exit(1);
    }
  }

  private async closeApplication(): Promise<void> {
    if (!this.closeHandler) {
      this.logger.warn(
        'No application close handler registered; skipping resource disposal.',
      );
      return;
    }
    this.logger.log(
      'Closing HTTP server and disposing database/Redis connections...',
    );
    await this.closeHandler();
    this.logger.log('HTTP server closed and connections disposed.');
  }

  private async runHooks(): Promise<void> {
    if (this.hooks.length === 0) return;
    this.logger.log(`Running ${this.hooks.length} shutdown hook(s)...`);
    for (const hook of this.hooks) {
      try {
        await hook.run();
        this.logger.log(`Shutdown hook "${hook.name}" finished.`);
      } catch (error) {
        // A failing hook must not stop the remaining cleanup steps.
        this.logger.error(
          `Shutdown hook "${hook.name}" failed: ${describe(error)}`,
        );
      }
    }
  }
}
