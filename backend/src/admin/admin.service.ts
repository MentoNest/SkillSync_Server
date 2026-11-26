import {
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { AuditEvent } from '../audit/entities/audit-log.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { Role } from '../auth/auth.types';
import {
  BusinessRuleException,
  ResourceNotFoundException,
} from '../common/errors/app-exceptions';
import { PaginatedResponse } from '../common/pagination/pagination.interface';
import { PaginationQueryDto } from '../common/pagination/pagination.dto';
import { PaginationService } from '../common/pagination/pagination.service';
import { normalizeWalletAddress } from '../common/utils/wallet.utils';
import {
  NotificationChannel,
  NotificationType,
} from '../notifications/notification.types';
import { NotificationsService } from '../notifications/notifications.service';
import { RoleEntity } from '../user/role.entity';
import { User } from '../user/user.entity';
import { UserStatus } from '../user/user-status.enum';
import { UserService } from '../user/user.service';
import {
  AdminSessionStatus,
  AdminSession,
} from './entities/admin-session.entity';
import { ContentReport, ReportStatus } from './entities/content-report.entity';
import { UserSuspension } from './entities/user-suspension.entity';
import {
  AnalyticsRangeQueryDto,
  AssignRoleDto,
  AuditQueryDto,
  CancelSessionDto,
  CreateReportDto,
  DisputeResolution,
  ListReportsQueryDto,
  ListSessionsQueryDto,
  ListUsersQueryDto,
  ReportAction,
  ReportActionDto,
  ResolveDisputeDto,
  ResolveReportDto,
  SuspendUserDto,
  UnsuspendUserDto,
} from './dto/admin.dto';

type SortOptions = { sort?: string; order?: 'ASC' | 'DESC' };
type SortMap = Record<string, string>;

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
    @InjectRepository(ContentReport)
    private readonly reports: Repository<ContentReport>,
    @InjectRepository(AdminSession)
    private readonly sessions: Repository<AdminSession>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    private readonly userService: UserService,
    private readonly audit: AuditService,
    private readonly pagination: PaginationService,
    private readonly dataSource: DataSource,
    @Optional()
    @InjectRepository(UserSuspension)
    private readonly suspensions?: Repository<UserSuspension>,
    @Optional() private readonly authService?: AuthService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async listUsers(query: ListUsersQueryDto): Promise<PaginatedResponse<User>> {
    const qb = this.users
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'roles');
    if (query.status)
      qb.andWhere('u.status = :status', { status: query.status });
    if (query.role) qb.andWhere('u.role = :role', { role: query.role });
    if (query.search) {
      const term = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      qb.andWhere(
        '(u.username ILIKE :search OR u.displayName ILIKE :search OR u.walletAddress ILIKE :search)',
        { search: term },
      );
    }
    this.applySort(
      qb,
      query,
      {
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
        walletAddress: 'walletAddress',
        status: 'status',
        role: 'role',
      },
      'createdAt',
      'u',
    );
    return this.paginate(qb, query);
  }

  async getUser(walletAddress: string): Promise<User> {
    const address = normalizeWalletAddress(walletAddress);
    const user = await this.users.findOne({
      where: { walletAddress: address },
      relations: ['roles'],
      withDeleted: true,
    });
    if (!user) throw new ResourceNotFoundException('User', address);
    return user;
  }

  async suspendUser(
    walletAddress: string,
    adminAddress: string,
    dto?: Partial<SuspendUserDto>,
  ) {
    const address = normalizeWalletAddress(walletAddress);
    const admin = normalizeWalletAddress(adminAddress);
    if (address === admin) {
      throw new BusinessRuleException(
        'Admins cannot suspend their own account',
      );
    }
    const targetUser = await this.getUser(address);
    if (targetUser.deletedAt || targetUser.status === UserStatus.DELETED) {
      throw new BusinessRuleException('Cannot suspend a deleted user');
    }

    const reason = dto?.reason?.trim() || 'Suspended by an administrator';
    const durationDays = dto?.duration ?? null;
    const suspendedAt = new Date();
    const suspendedUntil =
      durationDays !== null && durationDays !== undefined
        ? new Date(suspendedAt.getTime() + durationDays * 86_400_000)
        : null;

    let suspensionRecord: UserSuspension | null = null;
    if (this.suspensions) {
      await this.suspensions.update(
        { walletAddress: address, isActive: true },
        {
          isActive: false,
          liftedAt: suspendedAt,
          liftedBy: admin,
        },
      );
      suspensionRecord = await this.suspensions.save(
        this.suspensions.create({
          walletAddress: address,
          reason,
          suspendedBy: admin,
          suspendedAt,
          suspendedUntil,
          isActive: true,
          liftedAt: null,
          liftedBy: null,
        }),
      );
    }

    const result = await this.userService.setStatus(
      address,
      UserStatus.SUSPENDED,
    );
    await this.authService?.invalidateUserSessions(address);
    await this.log(AuditEvent.USER_SUSPENDED, adminAddress, address, {
      reason,
      durationDays,
      suspendedUntil: suspendedUntil?.toISOString() ?? null,
      suspensionId: suspensionRecord?.id ?? null,
    });
    await this.notifications?.notify({
      userId: address,
      recipientEmail: targetUser.email,
      type: NotificationType.ACCOUNT_SUSPENDED,
      title: 'Your SkillSync account has been suspended',
      body: suspendedUntil
        ? `Your account has been suspended until ${suspendedUntil.toISOString()}. Reason: ${reason}`
        : `Your account has been permanently suspended. Reason: ${reason}`,
      data: {
        reason,
        suspendedUntil: suspendedUntil?.toISOString() ?? null,
      },
      channels: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
    });
    return {
      ...result,
      suspension: suspensionRecord,
    };
  }

  async unsuspendUser(
    walletAddress: string,
    adminAddress: string,
    dto?: UnsuspendUserDto,
  ) {
    const address = normalizeWalletAddress(walletAddress);
    const admin = normalizeWalletAddress(adminAddress);
    const targetUser = await this.getUser(address);

    const activeSuspension = this.suspensions
      ? await this.suspensions.findOne({
          where: { walletAddress: address, isActive: true },
          order: { suspendedAt: 'DESC' },
        })
      : null;

    if (targetUser.status !== UserStatus.SUSPENDED && !activeSuspension) {
      throw new BusinessRuleException('User is not currently suspended');
    }

    const liftedAt = new Date();
    if (this.suspensions) {
      await this.suspensions.update(
        { walletAddress: address, isActive: true },
        {
          isActive: false,
          liftedAt,
          liftedBy: admin,
        },
      );
    }

    const result = await this.userService.setStatus(address, UserStatus.ACTIVE);
    await this.log(AuditEvent.USER_UNSUSPENDED, adminAddress, address, {
      reason: dto?.reason ?? null,
      suspensionId: activeSuspension?.id ?? null,
    });
    await this.notifications?.notify({
      userId: address,
      recipientEmail: targetUser.email,
      type: NotificationType.ACCOUNT_UNSUSPENDED,
      title: 'Your SkillSync account suspension has been lifted',
      body: 'Your account is active again and you may sign in.',
      channels: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
    });
    return {
      ...result,
      liftedAt,
    };
  }

  async listSuspendedUsers(
    query: PaginationQueryDto,
  ): Promise<PaginatedResponse<UserSuspension>> {
    if (!this.suspensions) {
      return {
        data: [],
        meta: {
          page: query.page ?? 1,
          limit: query.limit ?? 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
    }
    const now = new Date();
    const qb = this.suspensions
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'user')
      .where('s.isActive = :isActive', { isActive: true })
      .andWhere('(s.suspendedUntil IS NULL OR s.suspendedUntil > :now)', {
        now,
      })
      .orderBy('s.suspendedAt', 'DESC');
    return this.paginate(qb, query);
  }

  async deleteUser(
    walletAddress: string,
    adminAddress: string,
  ): Promise<{ deleted: true }> {
    const address = normalizeWalletAddress(walletAddress);
    const admin = normalizeWalletAddress(adminAddress);
    if (address === admin)
      throw new BusinessRuleException('Admins cannot delete their own account');
    await this.getUser(address);
    await this.userService.softDelete(address);
    await this.authService?.invalidateUserSessions(address);
    await this.log(AuditEvent.USER_DELETED, adminAddress, address);
    return { deleted: true };
  }

  async restoreUser(walletAddress: string, adminAddress: string) {
    const address = normalizeWalletAddress(walletAddress);
    const result = await this.userService.restore(address);
    await this.log(AuditEvent.USER_RESTORED, adminAddress, address);
    return result;
  }

  async assignRole(
    walletAddress: string,
    dto: AssignRoleDto,
    adminAddress: string,
  ): Promise<{ walletAddress: string; role: Role }> {
    const address = normalizeWalletAddress(walletAddress);
    const user = await this.getUser(address);
    let role = await this.roles.findOne({ where: { name: dto.role } });
    if (!role) {
      role = this.roles.create({
        name: dto.role,
        permissions: dto.role === Role.ADMIN ? ['*'] : [],
      });
      await this.roles.save(role);
    }
    const assigned = user.roles ?? [];
    if (!assigned.some((item) => item.name === role.name)) {
      user.roles = [...assigned, role];
      await this.users.save(user);
    }
    await this.users.update({ walletAddress: address }, { role: role.name });
    await this.log(AuditEvent.ROLE_ASSIGNED, adminAddress, address, {
      role: dto.role,
    });
    return { walletAddress: address, role: dto.role };
  }

  async listSessions(
    query: ListSessionsQueryDto,
  ): Promise<PaginatedResponse<AdminSession>> {
    const qb = this.sessions.createQueryBuilder('s');
    if (query.status)
      qb.andWhere('CAST(s.status AS text) = :status', { status: query.status });
    if (query.walletAddress) {
      qb.andWhere(
        '(CAST(s.mentorId AS text) = :wallet OR CAST(s.menteeId AS text) = :wallet)',
        {
          wallet: normalizeWalletAddress(query.walletAddress),
        },
      );
    }
    if (query.search) {
      const term = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      qb.andWhere(
        '(CAST(s.id AS text) ILIKE :search OR s.notes ILIKE :search)',
        { search: term },
      );
    }
    this.applySort(
      qb,
      query,
      {
        createdAt: 'createdAt',
        startTime: 'startTime',
        endTime: 'endTime',
        status: 'status',
      },
      'createdAt',
      's',
    );
    return this.paginate(qb, query);
  }

  async getSession(id: string): Promise<AdminSession> {
    const session = await this.sessions.findOne({ where: { id } });
    if (!session) throw new ResourceNotFoundException('Session', id);
    return session;
  }

  async cancelSession(
    id: string,
    adminAddress: string,
    dto: CancelSessionDto,
  ): Promise<AdminSession> {
    const session = await this.getSession(id);
    if (session.status === AdminSessionStatus.CANCELLED) {
      throw new BusinessRuleException('Session is already cancelled');
    }
    session.status = AdminSessionStatus.CANCELLED;
    session.cancellationReason = dto.reason ?? 'Cancelled by an administrator';
    session.notes = [
      session.notes,
      `Cancelled by ${normalizeWalletAddress(adminAddress)}: ${session.cancellationReason}`,
    ]
      .filter(Boolean)
      .join('\n');
    const saved = await this.sessions.save(session);
    await this.log(AuditEvent.SESSION_CANCELLED, adminAddress, id, {
      reason: session.cancellationReason,
    });
    return saved;
  }

  async resolveDispute(
    id: string,
    adminAddress: string,
    dto: ResolveDisputeDto,
  ): Promise<AdminSession> {
    const session = await this.getSession(id);
    const status =
      dto.resolution === DisputeResolution.COMPLETE
        ? AdminSessionStatus.COMPLETED
        : dto.resolution === DisputeResolution.CANCEL
          ? AdminSessionStatus.CANCELLED
          : session.status;
    session.status = status;
    session.notes = [
      session.notes,
      `Dispute ${dto.resolution} by ${adminAddress}: ${dto.reason ?? 'no reason provided'}`,
    ]
      .filter(Boolean)
      .join('\n');
    if (status === AdminSessionStatus.CANCELLED) {
      session.cancellationReason =
        dto.reason ?? 'Dispute resolved by an administrator';
    }
    const saved = await this.sessions.save(session);
    await this.log(AuditEvent.DISPUTE_RESOLVED, adminAddress, id, {
      resolution: dto.resolution,
      status,
    });
    return saved;
  }

  async sessionStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    active: number;
    completed: number;
    cancelled: number;
  }> {
    const rows: { status: string; count: string }[] = await this.sessions
      .createQueryBuilder('s')
      .select('s.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('s.status')
      .getRawMany();
    const byStatus = Object.fromEntries(
      rows.map((row) => [row.status, Number(row.count)]),
    );
    return {
      total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
      byStatus,
      active:
        (byStatus[AdminSessionStatus.PENDING] ?? 0) +
        (byStatus[AdminSessionStatus.CONFIRMED] ?? 0),
      completed: byStatus[AdminSessionStatus.COMPLETED] ?? 0,
      cancelled: byStatus[AdminSessionStatus.CANCELLED] ?? 0,
    };
  }

  async userGrowth(
    days: number = 30,
    now: Date = new Date(),
  ): Promise<{
    total: number;
    newUsers: number;
    days: number;
    growth: { day: string; count: number }[];
  }> {
    const windowDays = Math.min(Math.max(Math.floor(days) || 30, 1), 365);
    const since = new Date(now.getTime() - windowDays * 86_400_000);
    const [total, newUsers, rows] = await Promise.all([
      this.users.count(),
      this.users
        .createQueryBuilder('u')
        .where('u.createdAt >= :since', { since })
        .getCount(),
      this.users
        .createQueryBuilder('u')
        .select("to_char(u.created_at, 'YYYY-MM-DD')", 'day')
        .addSelect('COUNT(*)', 'count')
        .where('u.createdAt >= :since', { since })
        .groupBy('day')
        .orderBy('day', 'ASC')
        .getRawMany<{ day: string; count: string }>(),
    ]);
    return {
      total,
      newUsers,
      days: windowDays,
      growth: rows.map((row) => ({ day: row.day, count: Number(row.count) })),
    };
  }

  revenue(): {
    available: false;
    amount: number;
    currency: string;
    message: string;
  } {
    return {
      available: false,
      amount: 0,
      currency: 'USD',
      message:
        'Revenue reporting is not available: no payment data source is configured.',
    };
  }

  async analytics(
    query: AnalyticsRangeQueryDto = {},
  ): Promise<Record<string, unknown>> {
    const [users, sessions] = await Promise.all([
      this.userGrowth(query.days),
      this.sessionStats(),
    ]);
    return { users, sessions, revenue: this.revenue() };
  }

  async systemHealth(): Promise<Record<string, unknown>> {
    if (!this.dataSource.isInitialized) {
      throw new ServiceUnavailableException('Database is not initialized');
    }
    try {
      await this.dataSource.query('SELECT 1');
    } catch (error) {
      throw new ServiceUnavailableException(
        `Database health check failed: ${(error as Error).message}`,
      );
    }
    return {
      status: 'ok',
      database: 'up',
      uptimeSeconds: Math.round(process.uptime()),
      memoryRssBytes: process.memoryUsage().rss,
      checkedAt: new Date().toISOString(),
    };
  }

  async createReport(
    reporterAddress: string,
    dto: CreateReportDto,
  ): Promise<ContentReport> {
    const reporterId = normalizeWalletAddress(reporterAddress);
    const report = this.reports.create({
      reporterId,
      targetType: dto.targetType,
      targetId: dto.targetId,
      reason: dto.reason,
      status: ReportStatus.OPEN,
      resolvedBy: null,
      resolutionNote: null,
      resolvedAt: null,
      deletedAt: null,
    });
    const saved = await this.reports.save(report);
    await this.log(AuditEvent.REPORT_CREATED, reporterAddress, saved.id, {
      targetType: dto.targetType,
      targetId: dto.targetId,
    });
    return saved;
  }

  async listReports(
    query: ListReportsQueryDto,
  ): Promise<PaginatedResponse<ContentReport>> {
    const qb = this.reports.createQueryBuilder('r');
    if (query.includeDeleted) qb.withDeleted();
    if (query.status)
      qb.andWhere('r.status = :status', { status: query.status });
    if (query.targetType)
      qb.andWhere('r.targetType = :targetType', {
        targetType: query.targetType,
      });
    if (query.reporterId) {
      qb.andWhere('r.reporterId = :reporterId', {
        reporterId: normalizeWalletAddress(query.reporterId),
      });
    }
    this.applySort(
      qb,
      query,
      {
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
        resolvedAt: 'resolvedAt',
        status: 'status',
      },
      'createdAt',
      'r',
    );
    return this.paginate(qb, query);
  }

  async getReport(id: string): Promise<ContentReport> {
    return this.findReport(id, false);
  }

  async resolveReport(
    id: string,
    adminAddress: string,
    dto: ResolveReportDto,
  ): Promise<ContentReport> {
    const report = await this.findReport(id, false);
    if (report.status !== ReportStatus.OPEN)
      throw new BusinessRuleException('Report is already closed');
    report.status = dto.status;
    report.resolvedBy = normalizeWalletAddress(adminAddress);
    report.resolutionNote = dto.note ?? null;
    report.resolvedAt = new Date();
    const saved = await this.reports.save(report);
    await this.log(AuditEvent.REPORT_RESOLVED, adminAddress, id, {
      status: dto.status,
    });
    return saved;
  }

  async takeReportAction(
    id: string,
    adminAddress: string,
    dto: ReportActionDto,
  ): Promise<ContentReport> {
    const report = await this.findReport(id, false);
    const status =
      dto.action === ReportAction.DISMISS
        ? ReportStatus.DISMISSED
        : ReportStatus.RESOLVED;
    report.status = status;
    report.resolvedBy = normalizeWalletAddress(adminAddress);
    report.resolutionNote = [dto.action, dto.note].filter(Boolean).join(': ');
    report.resolvedAt = new Date();
    const saved = await this.reports.save(report);
    await this.log(AuditEvent.REPORT_ACTION_TAKEN, adminAddress, id, {
      action: dto.action,
      status,
    });
    return saved;
  }

  async softDeleteReport(
    id: string,
    adminAddress: string,
  ): Promise<{ deleted: true }> {
    await this.findReport(id, false);
    await this.reports.softDelete(id);
    await this.log(AuditEvent.REPORT_DELETED, adminAddress, id);
    return { deleted: true };
  }

  async restoreReport(
    id: string,
    adminAddress: string,
  ): Promise<ContentReport> {
    const report = await this.findReport(id, true);
    if (!report.deletedAt)
      throw new BusinessRuleException('Report is not deleted');
    await this.reports.restore(id);
    await this.log(AuditEvent.REPORT_RESTORED, adminAddress, id);
    return this.findReport(id, false);
  }

  async auditLogs(query: AuditQueryDto): Promise<PaginatedResponse<AuditLog>> {
    const qb = this.auditLogRepo.createQueryBuilder('a');
    if (query.event) qb.andWhere('a.event = :event', { event: query.event });
    if (query.walletAddress) {
      qb.andWhere('a.walletAddress = :walletAddress', {
        walletAddress: normalizeWalletAddress(query.walletAddress),
      });
    }
    if (query.targetId)
      qb.andWhere('a.targetId = :targetId', { targetId: query.targetId });
    if (query.from)
      qb.andWhere('a.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('a.createdAt <= :to', { to: new Date(query.to) });
    this.applySort(
      qb,
      query,
      { createdAt: 'createdAt', event: 'event' },
      'createdAt',
      'a',
    );
    return this.paginate(qb, query);
  }

  private async findReport(
    id: string,
    withDeleted: boolean,
  ): Promise<ContentReport> {
    const report = await this.reports.findOne({ where: { id }, withDeleted });
    if (!report) throw new ResourceNotFoundException('Content report', id);
    return report;
  }

  private log(
    event: AuditEvent,
    walletAddress: string,
    targetId?: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    return this.audit.record({
      event,
      walletAddress,
      targetId: targetId ?? null,
      metadata,
    });
  }

  private applySort<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    query: SortOptions,
    allowed: SortMap,
    fallback: string,
    alias: string,
  ): SelectQueryBuilder<T> {
    const key =
      query.sort && Object.prototype.hasOwnProperty.call(allowed, query.sort)
        ? allowed[query.sort]
        : fallback;
    return qb.orderBy(`${alias}.${key}`, query.order ?? 'DESC');
  }

  private paginate<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    query: { page?: number; limit?: number },
  ): Promise<PaginatedResponse<T>> {
    return this.pagination.paginate(qb, query.page, query.limit);
  }
}
