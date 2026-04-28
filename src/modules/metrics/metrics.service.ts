import { Injectable, Inject } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram, Gauge } from 'prom-client';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
// Assuming you have User entity, adjust as needed
import { User } from '../user/user.entity';

@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('http_requests_total')
    private readonly httpRequestsTotal: Counter<string>,
    @InjectMetric('http_request_duration_seconds')
    private readonly httpRequestDuration: Histogram<string>,
    @InjectMetric('db_query_duration_seconds')
    private readonly dbQueryDuration: Histogram<string>,
    @InjectMetric('db_connection_pool_size')
    private readonly dbConnectionPoolSize: Gauge<string>,
    @InjectMetric('redis_operation_duration_seconds')
    private readonly redisOperationDuration: Histogram<string>,
    @InjectMetric('active_users')
    private readonly activeUsers: Gauge<string>,
    @InjectMetric('jwt_verification_failures_total')
    private readonly jwtVerificationFailures: Counter<string>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // HTTP metrics
  incrementHttpRequests(method: string, status: string, endpoint: string) {
    this.httpRequestsTotal
      .labels({ method, status, endpoint })
      .inc();
  }

  recordHttpRequestDuration(method: string, status: string, endpoint: string, duration: number) {
    this.httpRequestDuration
      .labels({ method, status, endpoint })
      .observe(duration);
  }

  // Database metrics
  recordDbQueryDuration(query: string, duration: number) {
    this.dbQueryDuration
      .labels({ query })
      .observe(duration);
  }

  setDbConnectionPoolSize(size: number) {
    this.dbConnectionPoolSize.set(size);
  }

  // Redis metrics
  recordRedisOperationDuration(operation: string, duration: number) {
    this.redisOperationDuration
      .labels({ operation })
      .observe(duration);
  }

  // Application metrics
  async updateActiveUsers() {
    // Assuming active users are those who logged in within the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeUserCount = await this.userRepository.count({
      where: {
        lastLoginAt: { $gte: twentyFourHoursAgo } as any, // Adjust based on your User entity
      },
    });
    this.activeUsers.set(activeUserCount);
  }

  incrementJwtVerificationFailures(reason: string) {
    this.jwtVerificationFailures
      .labels({ reason })
      .inc();
  }
}