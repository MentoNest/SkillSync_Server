import { Module, DynamicModule, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppConfigModule } from '../config/app-config.module';
import { AppConfigService } from '../config/app-config.service';
import { createTypeOrmConfig } from './database.config';

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRootAsync({
          imports: [AppConfigModule],
          useFactory: async (configService: AppConfigService) => {
            return createTypeOrmConfig(configService);
          },
          inject: [AppConfigService],
          async dataSourceFactory(options) {
            if (!options) {
              throw new Error('Invalid options passed to TypeORM');
            }
            
            // Retry logic for database connection
            const maxRetries = 5;
            let retries = 0;
            
            while (retries < maxRetries) {
              try {
                const dataSource = new DataSource(options);
                await dataSource.initialize();
                console.log(`Database connected successfully (attempt ${retries + 1})`);
                return dataSource;
              } catch (error) {
                retries++;
                console.error(`Database connection attempt ${retries} failed:`, error.message);
                
                if (retries >= maxRetries) {
                  console.error('Max database connection retries reached');
                  throw error;
                }
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 3000));
              }
            }
            
            throw new Error('Failed to connect to database');
          },
        }),
      ],
      exports: [TypeOrmModule],
    };
  }

  static forRootAsync(options: {
    imports?: any[];
    useFactory?: (...args: any[]) => Promise<any>;
    inject?: any[];
  }): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRootAsync({
          imports: options.imports || [AppConfigModule],
          useFactory: async (configService: AppConfigService) => {
            return createTypeOrmConfig(configService);
          },
          inject: options.inject || [AppConfigService],
        }),
      ],
      exports: [TypeOrmModule],
    };
  }
}
