import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { RateLimitGuard } from "./rate-limit.guard";

/**
 * Registers the rate limiter as a global guard, so it runs on every route
 * in the application without being added to each controller.
 *
 * `APP_GUARD` is Nest's special token for global guards. Registering the
 * guard here, instead of calling `app.useGlobalGuards()` in `main.ts`, lets
 * Nest build it through dependency injection, which is how the guard gets
 * its Redis client, `Reflector` and `ConfigService`.
 *
 * This module only needs to be imported once, usually in `AppModule`. The
 * guard's own dependencies (the `REDIS` provider and `ConfigService`) must be
 * available here: import the Redis module, or make it global, and make
 * `ConfigModule` global or import it.
 */
@Module({ providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }] })
export class RateLimitModule {}
