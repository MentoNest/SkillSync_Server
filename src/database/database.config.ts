import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseRequestSubscriber } from './subscribers/database-request.subscriber';

export const createTypeOrmConfig = async (
  configService: AppConfigService,
): Promise<TypeOrmModuleOptions> => {
  const isDevelopment = configService.isDevelopment();
  const isProduction = configService.isProduction();
  const dbConfig = configService.getDatabaseConfig();

  return {
    type: 'postgres',
    host: dbConfig.host,
    port: dbConfig.port,
    username: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    
    // Entity auto-loading
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    
    // Migration configuration
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    migrationsTableName: 'migrations',
    
    // Subscribers for request ID propagation
    subscribers: [DatabaseRequestSubscriber],
    
    // Synchronization (only in development)
    synchronize: configService.get<boolean>('DATABASE_SYNCHRONIZE') || false,
    
    // Logging configuration
    logging: configService.get<boolean>('DATABASE_LOGGING') || false,
    logger: 'advanced-console',
    
    // Connection pool configuration
    extra: {
      max: configService.get<number>('DATABASE_POOL_SIZE') || 10,
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    },
    
    // SSL configuration for production
    ssl: isProduction && configService.get<boolean>('DATABASE_SSL') 
      ? { rejectUnauthorized: false } 
      : false,
    
    // Slow query logging in development
    ...(isDevelopment && {
      maxQueryExecutionTime: 1000, // Log queries taking more than 1 second
    }),
    
    // Retry configuration
    retryAttempts: 5,
    retryDelay: 3000,
  };
};
