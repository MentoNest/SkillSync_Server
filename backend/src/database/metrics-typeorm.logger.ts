import {
  AdvancedConsoleLogger,
  Logger as TypeOrmLogger,
  QueryRunner,
} from 'typeorm';
import type { LoggerOptions } from 'typeorm';
import { MetricsService } from '../metrics/metrics.service.js';

export class MetricsTypeOrmLogger implements TypeOrmLogger {
  private readonly delegate: AdvancedConsoleLogger;

  constructor(
    private readonly metrics: MetricsService,
    logging: LoggerOptions | undefined,
    private readonly slowQueryThresholdMs: number,
  ) {
    this.delegate = new AdvancedConsoleLogger(logging);
  }

  logQuery(
    query: string,
    parameters?: unknown[],
    queryRunner?: QueryRunner,
  ): void {
    const labels = this.getQueryLabels(query);
    this.metrics.recordDbQueryCount(labels.operation, labels.table);
    this.delegate.logQuery(query, parameters, queryRunner);
  }

  logQueryError(
    error: string | Error,
    query: string,
    parameters?: unknown[],
    queryRunner?: QueryRunner,
  ): void {
    this.delegate.logQueryError(
      typeof error === 'string' ? error : error.message,
      query,
      parameters,
      queryRunner,
    );
  }

  logQuerySlow(
    time: number,
    query: string,
    parameters?: unknown[],
    queryRunner?: QueryRunner,
  ): void {
    const labels = this.getQueryLabels(query);
    this.metrics.recordDbQueryCount(labels.operation, labels.table);
    this.metrics.recordDbQueryDuration(
      labels.operation,
      labels.table,
      time / 1000,
    );
    if (time >= this.slowQueryThresholdMs) {
      this.delegate.logQuerySlow(time, query, parameters, queryRunner);
    } else {
      this.delegate.logQuery(query, parameters, queryRunner);
    }
  }

  logSchemaBuild(message: string, queryRunner?: QueryRunner): void {
    this.delegate.logSchemaBuild(message, queryRunner);
  }

  logMigration(message: string, queryRunner?: QueryRunner): void {
    this.delegate.logMigration(message, queryRunner);
  }

  log(
    level: 'log' | 'info' | 'warn',
    message: unknown,
    queryRunner?: QueryRunner,
  ): void {
    this.delegate.log(level, message, queryRunner);
  }

  private getQueryLabels(query: string): { operation: string; table: string } {
    const operation = query
      .trim()
      .match(/^(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)/i)?.[1];
    const table = query.match(
      /\b(?:FROM|INTO|UPDATE|JOIN)\s+["`]?([\w.]+)/i,
    )?.[1];
    return {
      operation: operation?.toUpperCase() ?? 'OTHER',
      table: table?.replaceAll('"', '').split('.').at(-1) ?? 'unknown',
    };
  }
}
