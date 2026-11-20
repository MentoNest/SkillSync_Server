import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDatabaseSettings } from './database.config';
import { DatabaseHealthService } from './database-health.service';
import { AdminSeedService } from './admin-seed.service';

/**
 * PostgreSQL through TypeORM. The connection is retried (5 attempts by default) while the
 * application starts; entities are picked up from `*.entity.ts` files.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { options, retryAttempts, retryDelay } = buildDatabaseSettings(
          (key) => config.get<string>(key),
        );
        return {
          ...options,
          autoLoadEntities: true,
          retryAttempts,
          retryDelay,
        };
      },
    }),
  ],
  providers: [DatabaseHealthService, AdminSeedService],
  exports: [DatabaseHealthService],
})
export class DatabaseModule {}
