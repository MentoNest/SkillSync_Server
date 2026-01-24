import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private configService: NestConfigService) {}

  get nodeEnv(): string {
    return this.configService.get<string>('NODE_ENV')!;
  }

  get port(): number {
    return this.configService.get<number>('PORT')!;
  }

  get databaseHost(): string {
    return this.configService.get<string>('DATABASE_HOST')!;
  }

  get databasePort(): number {
    return this.configService.get<number>('DATABASE_PORT')!;
  }

  get databaseUser(): string {
    return this.configService.get<string>('DATABASE_USER')!;
  }

  get databasePassword(): string {
    return this.configService.get<string>('DATABASE_PASSWORD')!;
  }

  get databaseName(): string {
    return this.configService.get<string>('DATABASE_NAME')!;
  }

  get redisHost(): string {
    return this.configService.get<string>('REDIS_HOST')!;
  }

  get redisPort(): number {
    return this.configService.get<number>('REDIS_PORT')!;
  }

  get redisPassword(): string | undefined {
    return this.configService.get<string>('REDIS_PASSWORD');
  }

  get redisDb(): number {
    return this.configService.get<number>('REDIS_DB')!;
  }

  get(key: string): any {
    return this.configService.get(key);
  }
}
