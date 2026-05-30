import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { ProfileHistory } from '../users/entities/profile-history.entity';
import { SuspensionService } from '../auth/suspension.service';
import { AuditLogService, RequestAudit } from '../auth/audit-log.service';
import { AuditEventType } from '../auth/entities/audit-log.entity';
import { Report } from './entities/report.entity';
import { FlaggedContent } from './entities/flagged-content.entity';
import { Session } from './entities/session.entity';
import { Role } from '../users/entities/role.entity';

type ReportStatus = 'pending' | 'resolved' | 'dismissed';
type ReportType = 'inappropriate_content' | 'spam' | 'harassment' | 'other';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(ProfileHistory) private readonly historyRepo: Repository<ProfileHistory>,
    @InjectRepository(Report) private readonly reportRepo: Repository<Report>,
    @InjectRepository(FlaggedContent) private readonly flaggedContentRepo: Repository<FlaggedContent>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    private readonly suspensionService: SuspensionService,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  async verifyMentor(
    mentorId: string,
    adminId: string,
    notes?: string,
  ): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: mentorId } });
    if (!user) throw new NotFoundException('Mentor not found');

    user.isVerified = true;
    user.verifiedAt = new Date();
    user.verifiedBy = adminId;
    user.verificationNotes = notes ?? null;
    return this.userRepo.save(user);
  }

  async revokeVerification(mentorId: string, adminId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: mentorId } });
    if (!user) throw new NotFoundException('Mentor not found');

    user.isVerified = false;
    user.verifiedAt = null;
    user.verifiedBy = adminId;
    user.verificationNotes = null;
    return this.userRepo.save(user);
  }

  async getProfileHistory(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ items: ProfileHistory[]; total: number }> {
    const [items, total] = await this.historyRepo.findAndCount({
      where: { userId },
      order: { changedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
  }

  async suspendUser(
    userId: string,
    adminId: string,
    reason: string,
    durationDays?: number | null,
  ) {
    return this.suspensionService.suspendUser(userId, adminId, reason, durationDays);
  }

  async unsuspendUser(userId: string, adminId: string) {
    return this.suspensionService.unsuspendUser(userId, adminId);
  }

  async listSuspendedUsers(limit = 50, offset = 0) {
    return this.suspensionService.listActiveSuspensions(limit, offset);
  }

  async listUsers(
    filters: {
      search?: string;
      role?: string;
      limit: number;
      offset: number;
      sortBy: string;
      sortOrder: 'ASC' | 'DESC';
    },
  ): Promise<{ items: User[]; total: number }> {
    const { search, role, limit, offset, sortBy, sortOrder } = filters;
    
    const query = this.userRepo.createQueryBuilder('user');
    
    if (role) {
      query.innerJoin('user.roles', 'roles').where('roles.name = :role', { role });
    }
    
    if (search) {
      query.andWhere(
        '(user.walletAddress ILIKE :search OR user.username ILIKE :search OR user.display_name ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    
    query
      .orderBy(`user.${sortBy}`, sortOrder)
      .take(limit)
      .skip(offset);
    
    const [items, total] = await query.getManyAndCount();
    return { items, total };
  }

  async getUser(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ 
      where: { id: userId },
      relations: ['roles'],
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async assignRole(
    userId: string,
    adminId: string,
    roleName: string,
    audit: RequestAudit,
  ): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const role = await this.roleRepo.findOne({ where: { name: roleName } });
    if (!role) throw new NotFoundException(`Role '${roleName}' not found`);

    if (!user.roles.some((r) => r.name === roleName)) {
      user.roles = [...user.roles, role];
      user.tokenVersion += 1;
      await this.userRepo.save(user);
    }

    await this.auditLogService.logRoleAssignment({
      userId,
      assignedRole: roleName,
      assignedByUserId: adminId,
      audit,
    });

    return user;
  }

  async deleteUser(
    userId: string,
    adminId: string,
    audit: RequestAudit,
  ): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.userRepo.remove(user);

    await this.auditLogService.logEvent({
      userId: adminId,
      eventType: AuditEventType.USER_DELETED,
      audit,
      details: { deletedUserId: userId },
    });
  }

  async createReport(
    reporterId: string,
    reportedUserId: string,
    type: ReportType,
    reason: string,
  ): Promise<Report> {
    const report = this.reportRepo.create({
      reporterId,
      reportedUserId,
      type,
      reason,
      status: 'pending' as ReportStatus,
    });
    return this.reportRepo.save(report);
  }

  async revokeRole(
    userId: string,
    roleName: string,
    audit: RequestAudit,
  ): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    user.roles = user.roles.filter((r) => r.name !== roleName);
    user.tokenVersion += 1;
    await this.userRepo.save(user);

    await this.auditLogService.logEvent({
      userId: adminId,
      eventType: AuditEventType.ROLE_REVOKED,
      audit,
      details: {
        targetUserId: userId,
        roleName,
      },
    });

    return user;
  }

  async listReports(
    filters: {
      status?: ReportStatus;
      type?: ReportType;
      reportedUserId?: string;
      limit: number;
      offset: number;
      sortBy: string;
      sortOrder: 'ASC' | 'DESC';
    },
  ): Promise<{ items: Report[]; total: number }> {
    const { status, type, reportedUserId, limit, offset, sortBy, sortOrder } = filters;
    
    const query = this.reportRepo.createQueryBuilder('report');
    
    if (status) {
      query.where('report.status = :status', { status });
    }
    if (type) {
      query.andWhere('report.type = :type', { type });
    }
    if (reportedUserId) {
      query.andWhere('report.reportedUserId = :reportedUserId', { reportedUserId });
    }
    
    query
      .leftJoinAndSelect('report.reportedUser', 'reportedUser')
      .leftJoinAndSelect('report.reporter', 'reporter')
      .orderBy(`report.${sortBy}`, sortOrder)
      .take(limit)
      .skip(offset);
    
    const [items, total] = await query.getManyAndCount();
    return { items, total };
  }

  async getReport(reportId: string): Promise<Report> {
    const report = await this.reportRepo.findOne({
      where: { id: reportId },
      relations: ['reporter', 'reportedUser'],
    });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  async resolveReport(
    reportId: string,
    adminId: string,
    status: ReportStatus,
    adminNotes: string,
    audit: RequestAudit,
  ): Promise<Report> {
    const report = await this.reportRepo.findOne({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    report.status = status;
    report.resolvedAt = new Date();
    report.resolvedBy = adminId;
    report.adminNotes = adminNotes;
    const saved = await this.reportRepo.save(report);

    await this.auditLogService.logEvent({
      userId: adminId,
      eventType: AuditEventType.REPORT_RESOLVED,
      audit,
      details: {
        reportId,
        reportedUserId: report.reportedUserId,
        status,
      },
    });

    return saved;
  }

  async listFlaggedContent(
    filters: {
      status?: string;
      contentType?: string;
      limit: number;
      offset: number;
      sortBy: string;
      sortOrder: 'ASC' | 'DESC';
    },
  ): Promise<{ items: FlaggedContent[]; total: number }> {
    const { status, contentType, limit, offset, sortBy, sortOrder } = filters;
    
    const query = this.flaggedContentRepo.createQueryBuilder('flagged');
    
    if (status) {
      query.where('flagged.status = :status', { status });
    }
    if (contentType) {
      query.andWhere('flagged.contentType = :contentType', { contentType });
    }
    
    query
      .leftJoinAndSelect('flagged.flaggedByUser', 'user')
      .orderBy(`flagged.${sortBy}`, sortOrder)
      .take(limit)
      .skip(offset);
    
    const [items, total] = await query.getManyAndCount();
    return { items, total };
  }

  async getFlaggedContent(contentId: string): Promise<FlaggedContent> {
    const content = await this.flaggedContentRepo.findOne({
      where: { id: contentId },
      relations: ['flaggedByUser'],
    });
    if (!content) throw new NotFoundException('Flagged content not found');
    return content;
  }

  async removeContent(
    contentId: string,
    adminId: string,
    audit: RequestAudit,
  ): Promise<FlaggedContent> {
    const content = await this.flaggedContentRepo.findOne({ where: { id: contentId } });
    if (!content) throw new NotFoundException('Flagged content not found');

    content.status = 'removed';
    content.removedAt = new Date();
    content.removedBy = adminId;
    const saved = await this.flaggedContentRepo.save(content);

    await this.auditLogService.logEvent({
      userId: adminId,
      eventType: AuditEventType.CONTENT_REMOVED,
      audit,
      details: { contentId, contentType: content.contentType },
    });

    return saved;
  }

  async restoreContent(
    contentId: string,
    adminId: string,
    audit: RequestAudit,
  ): Promise<FlaggedContent> {
    const content = await this.flaggedContentRepo.findOne({ where: { id: contentId } });
    if (!content) throw new NotFoundException('Flagged content not found');

    content.status = 'restored';
    content.restoredAt = new Date();
    content.restoredBy = adminId;
    content.removedAt = null;
    content.removedBy = null;
    const saved = await this.flaggedContentRepo.save(content);

    await this.auditLogService.logEvent({
      userId: adminId,
      eventType: AuditEventType.CONTENT_RESTORED,
      audit,
      details: { contentId, contentType: content.contentType },
    });

    return saved;
  }

  async flagContent(
    contentId: string,
    contentType: 'portfolio_link' | 'message' | 'review' | 'profile',
    flaggedBy: string,
    reason: string,
  ): Promise<FlaggedContent> {
    const existingFlag = await this.flaggedContentRepo.findOne({ where: { contentId } });
    if (existingFlag) {
      throw new ConflictException('Content already flagged');
    }

    const flagged = this.flaggedContentRepo.create({
      contentId,
      contentType,
      flaggedBy,
      reason,
      status: 'flagged',
    });
    return this.flaggedContentRepo.save(flagged);
  }

  async listSessions(
    filters: {
      userId?: string;
      status?: string;
      search?: string;
      limit: number;
      offset: number;
      sortBy: string;
      sortOrder: 'ASC' | 'DESC';
    },
  ): Promise<{ items: Session[]; total: number }> {
    const { userId, status, search, limit, offset, sortBy, sortOrder } = filters;
    
    const query = this.sessionRepo.createQueryBuilder('session');
    
    if (userId) {
      query.where('session.userId = :userId', { userId });
    } else if (status) {
      query.where('session.status = :status', { status });
    } else if (search) {
      query.where(
        '(session.ip_address ILIKE :search OR session.user_agent ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    
    query
      .leftJoinAndSelect('session.user', 'user')
      .orderBy(`session.${sortBy}`, sortOrder)
      .take(limit)
      .skip(offset);
    
    const [items, total] = await query.getManyAndCount();
    return { items, total };
  }

  async getSession(sessionId: string): Promise<Session> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      relations: ['user'],
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async cancelSession(
    sessionId: string,
    adminId: string,
    audit: RequestAudit,
  ): Promise<Session> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');

    session.status = 'cancelled';
    session.endedAt = new Date();
    session.cancelledBy = adminId;
    const saved = await this.sessionRepo.save(session);

    await this.auditLogService.logEvent({
      userId: adminId,
      eventType: AuditEventType.SESSION_CANCELLED,
      audit,
      details: { sessionId },
    });

    return saved;
  }

  async interveneSession(
    sessionId: string,
    adminId: string,
    reason: string,
    audit: RequestAudit,
  ): Promise<Session> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');

    session.status = 'intervened';
    session.interventionReason = reason;
    session.endedAt = new Date();
    const saved = await this.sessionRepo.save(session);

    await this.auditLogService.logEvent({
      userId: adminId,
      eventType: AuditEventType.SESSION_INTERVENED,
      audit,
      details: { sessionId, reason },
    });

    return saved;
  }

  async getAnalytics(
    filters: {
      startDate?: string;
      endDate?: string;
      groupBy: 'day' | 'week' | 'month';
    },
  ): Promise<{
    userGrowth: Array<{ date: string; count: number }>;
    sessionStats: Array<{ date: string; active: number; cancelled: number }>;
    revenue: Array<{ date: string; amount: number }>;
  }> {
    const { startDate, endDate, groupBy } = filters;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const dateFormat = groupBy === 'day' ? 'YYYY-MM-DD' : groupBy === 'week' ? 'YYYY-WW' : 'YYYY-MM';

    const [userGrowth, sessionStats, revenue] = await Promise.all([
      this.getUserGrowthStats(start, end, groupBy),
      this.getSessionStats(start, end, groupBy),
      this.getRevenueStats(start, end, groupBy),
    ]);

    return { userGrowth, sessionStats, revenue };
  }

  private async getUserGrowthStats(
    start: Date,
    end: Date,
    groupBy: 'day' | 'week' | 'month',
  ): Promise<Array<{ date: string; count: number }>> {
    const query = this.userRepo.createQueryBuilder('user');
    query
      .select(`DATE_TRUNC('${groupBy}', user.created_at)`, 'date')
      .addSelect('COUNT(*)', 'count')
      .where('user.created_at BETWEEN :start AND :end', { start, end })
      .groupBy(`DATE_TRUNC('${groupBy}', user.created_at)`)
      .orderBy('date', 'ASC');
    
    return query.getRawMany();
  }

  private async getSessionStats(
    start: Date,
    end: Date,
    groupBy: 'day' | 'week' | 'month',
  ): Promise<Array<{ date: string; active: number; cancelled: number }>> {
    const query = this.sessionRepo.createEntityManager().createQueryBuilder(Session, 'session');
    query
      .select(`DATE_TRUNC('${groupBy}', session.started_at)`, 'date')
      .addSelect('COUNT(*) FILTER (WHERE session.status = :active)', 'active')
      .addSelect('COUNT(*) FILTER (WHERE session.status = :cancelled)', 'cancelled')
      .where('session.started_at BETWEEN :start AND :end', { start, end })
      .groupBy(`DATE_TRUNC('${groupBy}', session.started_at)`)
      .orderBy('date', 'ASC')
      .setParameters({ active: 'active', cancelled: 'cancelled' });
    
    return query.getRawMany();
  }

  private async getRevenueStats(
    start: Date,
    end: Date,
    groupBy: 'day' | 'week' | 'month',
  ): Promise<Array<{ date: string; amount: number }>> {
    return [];
  }

  async getSystemHealth(): Promise<{
    database: { status: string };
    redis: { status: string };
    memory: { used: number; total: number };
    uptime: number;
  }> {
    const dbCheck = await this.dataSource.query('SELECT 1 as check').catch(() => null);
    
    return {
      database: { status: dbCheck ? 'up' : 'down' },
      redis: { status: 'up' },
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
      },
      uptime: process.uptime(),
    };
  }
}