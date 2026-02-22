import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { AuditLog, AuditEventType } from '../entities/audit.entity';

export interface AuditLogEntry {
  eventType: AuditEventType;
  userId?: string | null;
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown> | null;
  success?: boolean;
  failureReason?: string | null;
}

export interface AuditQueryFilters {
  userId?: string;
  eventType?: AuditEventType;
  startDate?: Date;
  endDate?: Date;
  ipAddress?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Log an audit event to the database
   */
  async log(entry: AuditLogEntry): Promise<AuditLog> {
    try {
      const auditLog = this.auditLogRepository.create({
        eventType: entry.eventType,
        userId: entry.userId ?? null,
        email: entry.email ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        sessionId: entry.sessionId ?? null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        success: entry.success ?? true,
        failureReason: entry.failureReason ?? null,
      });

      const saved = await this.auditLogRepository.save(auditLog);
      
      this.logger.debug(
        `Audit log created: ${entry.eventType} for user=${entry.userId ?? 'anonymous'}`,
      );

      return saved;
    } catch (error) {
      this.logger.error('Failed to create audit log:', error);
      // Don't throw - audit logging should not break the main flow
      return null as unknown as AuditLog;
    }
  }

  /**
   * Log successful login
   */
  async logLoginSuccess(params: {
    userId: string;
    email: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  }): Promise<AuditLog> {
    return this.log({
      eventType: AuditEventType.LOGIN_SUCCESS,
      userId: params.userId,
      email: params.email,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      sessionId: params.sessionId,
      success: true,
    });
  }

  /**
   * Log failed login attempt
   */
  async logLoginFailed(params: {
    email?: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    reason: string;
  }): Promise<AuditLog> {
    return this.log({
      eventType: AuditEventType.LOGIN_FAILED,
      userId: params.userId ?? null,
      email: params.email ?? null,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      success: false,
      failureReason: params.reason,
    });
  }

  /**
   * Log logout event
   */
  async logLogout(params: {
    userId: string;
    email: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  }): Promise<AuditLog> {
    return this.log({
      eventType: AuditEventType.LOGOUT,
      userId: params.userId,
      email: params.email,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      sessionId: params.sessionId,
      success: true,
    });
  }

  /**
   * Log refresh token usage
   */
  async logRefreshToken(params: {
    userId: string;
    email: string;
    sessionId: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    failureReason?: string;
  }): Promise<AuditLog> {
    return this.log({
      eventType: AuditEventType.REFRESH_TOKEN,
      userId: params.userId,
      email: params.email,
      sessionId: params.sessionId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      success: params.success,
      failureReason: params.failureReason ?? null,
    });
  }

  /**
   * Log refresh token reuse attempt (security event)
   */
  async recordTokenReuseAttempt(params: {
    userId: string;
    sessionId: string;
    tokenId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLog> {
    this.logger.warn(
      `Refresh token reuse detected user=${params.userId} session=${params.sessionId} token=${params.tokenId}`,
    );

    return this.log({
      eventType: AuditEventType.REFRESH_TOKEN_REUSE,
      userId: params.userId,
      sessionId: params.sessionId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      success: false,
      failureReason: 'Refresh token reuse detected - possible token theft',
      metadata: {
        tokenId: params.tokenId,
        securityEvent: true,
      },
    });
  }

  /**
   * Log registration event
   */
  async logRegistration(params: {
    userId: string;
    email: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditLog> {
    return this.log({
      eventType: AuditEventType.REGISTRATION,
      userId: params.userId,
      email: params.email,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      success: true,
    });
  }

  /**
   * Query audit logs with filters
   */
  async findAll(filters: AuditQueryFilters = {}): Promise<{ data: AuditLog[]; total: number }> {
    const {
      userId,
      eventType,
      startDate,
      endDate,
      ipAddress,
      success,
      limit = 50,
      offset = 0,
    } = filters;

    const queryBuilder = this.auditLogRepository.createQueryBuilder('audit');

    if (userId) {
      queryBuilder.andWhere('audit.userId = :userId', { userId });
    }

    if (eventType) {
      queryBuilder.andWhere('audit.eventType = :eventType', { eventType });
    }

    if (ipAddress) {
      queryBuilder.andWhere('audit.ipAddress = :ipAddress', { ipAddress });
    }

    if (success !== undefined) {
      queryBuilder.andWhere('audit.success = :success', { success });
    }

    if (startDate && endDate) {
      queryBuilder.andWhere('audit.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (startDate) {
      queryBuilder.andWhere('audit.createdAt >= :startDate', { startDate });
    } else if (endDate) {
      queryBuilder.andWhere('audit.createdAt <= :endDate', { endDate });
    }

    // Order by newest first
    queryBuilder.orderBy('audit.createdAt', 'DESC');

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    queryBuilder.skip(offset).take(limit);

    const data = await queryBuilder.getMany();

    return { data, total };
  }

  /**
   * Find a single audit log by ID
   */
  async findOne(id: string): Promise<AuditLog | null> {
    return this.auditLogRepository.findOne({ where: { id } });
  }

  /**
   * Get recent audit logs for a specific user
   */
  async findByUser(userId: string, limit: number = 50): Promise<AuditLog[]> {
    return this.auditLogRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get recent failed login attempts for a specific IP
   */
  async getRecentFailedLogins(ipAddress: string, minutes: number = 30): Promise<number> {
    const since = new Date(Date.now() - minutes * 60 * 1000);
    
    return this.auditLogRepository.count({
      where: {
        ipAddress,
        eventType: AuditEventType.LOGIN_FAILED,
        createdAt: MoreThanOrEqual(since),
      },
    });
  }

  /**
   * Clean up old audit logs (for data retention)
   */
  async cleanupOldLogs(olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.auditLogRepository
      .createQueryBuilder()
      .delete()
      .where('createdAt < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected ?? 0;
  }
}
