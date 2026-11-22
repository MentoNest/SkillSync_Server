import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DEFAULT_SHUTDOWN_TIMEOUT_MS, ShutdownService } from './shutdown.service';

/** Parses `SHUTDOWN_TIMEOUT_MS`; falls back to the default when missing or invalid. */
function resolveTimeout(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_SHUTDOWN_TIMEOUT_MS;
}

/**
 * Graceful shutdown coordination: the shared `ShutdownService` plus the `GET /health`
 * endpoint that reports `503` while a shutdown is in progress.
 */
@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: ShutdownService,
      useFactory: () =>
        new ShutdownService({ timeoutMs: resolveTimeout(process.env.SHUTDOWN_TIMEOUT_MS) }),
    },
  ],
  exports: [ShutdownService],
})
export class ShutdownModule {}
