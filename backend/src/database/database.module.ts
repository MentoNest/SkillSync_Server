import { Module, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

/**
 * Provides a resilient TypeORM connection with retry logic.
 * Attempts to connect up to MAX_RETRIES times before failing startup.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: async (
        configService: ConfigService,
      ): Promise<TypeOrmModuleOptions> => {
        const logger = new Logger('DatabaseModule');
        const dbConfig =
          configService.get<TypeOrmModuleOptions>('database') ?? {};

        let retries = 0;

        while (retries < MAX_RETRIES) {
          try {
            logger.log(
              `Attempting database connection (attempt ${retries + 1}/${MAX_RETRIES})`,
            );
            // Return config — TypeORM will handle actual connection
            return {
              ...dbConfig,
              // Retry connection via connectTimeoutMS and retryAttempts
              retryAttempts: MAX_RETRIES,
              retryDelay: RETRY_DELAY_MS,
              autoLoadEntities: true,
            };
          } catch (error) {
            retries++;
            if (retries >= MAX_RETRIES) {
              logger.error(
                `Failed to connect to database after ${MAX_RETRIES} attempts`,
                error,
              );
              throw error;
            }
            logger.warn(
              `Database connection failed. Retrying in ${RETRY_DELAY_MS / 1000}s... (${retries}/${MAX_RETRIES})`,
            );
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          }
        }

        // Fallback (unreachable but satisfies TypeScript)
        return dbConfig as TypeOrmModuleOptions;
      },
      inject: [ConfigService],
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
