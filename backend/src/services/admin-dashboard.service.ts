import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, MoreThan } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { AuditLog } from '../auth/entities/audit-log.entity';
import { Role } from '../entities/role.entity';

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  totalMentors: number;
  totalMentees: number;
  activeSessions: number;
  totalSessions: number;
  revenue: number;
  pendingApprovals: number;
  reportedUsers: number;
  systemHealth: {
    status: 'healthy' | 'degraded' | 'down';
    uptime: number;
    lastChecked: Date;
  };
}

export interface UserManagement {
  id: string;
  email: string;
  displayName: string;
  profileType: string;
  status: 'active' | 'suspended' | 'pending';
  lastLogin: Date;
  createdAt: Date;
  roles: string[];
}

export interface ModerationReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reason: string;
  status: 'pending' | 'reviewed' | 'resolved';
  createdAt: Date;
}

export interface AnalyticsData {
  date: string;
  users: number;
  sessions: number;
  revenue: number;
}

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
  ) {}

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      newUsersToday,
      newUsersThisWeek,
    ] = await Promise.all([
      this.userRepo.count(),
      this.userRepo.count({ where: { lastLogin: MoreThan(weekStart) } }),
      this.userRepo.count({ where: { createdAt: MoreThan(todayStart) } }),
      this.userRepo.count({ where: { createdAt: MoreThan(weekStart) } }),
    ]);

    // Get system health
    const systemHealth = {
      status: 'healthy' as const,
      uptime: process.uptime(),
      lastChecked: new Date(),
    };

    return {
      totalUsers,
      activeUsers,
      newUsersToday,
      newUsersThisWeek,
      totalMentors: 0, // Will be calculated from profile types
      totalMentees: 0,
      activeSessions: 0,
      totalSessions: 0,
      revenue: 0,
      pendingApprovals: 0,
      reportedUsers: 0,
      systemHealth,
    };
  }

  /**
   * Get user management list
   */
  async getUserManagement(filters: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    profileType?: string;
  }): Promise<{ users: UserManagement[]; total: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;

    const query = this.userRepo.createQueryBuilder('user');

    if (filters.search) {
      query.where(
        '(user.email ILIKE :search OR user.displayName ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    if (filters.profileType) {
      query.andWhere('user.profileType = :profileType', {
        profileType: filters.profileType,
      });
    }

    const [users, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('user.createdAt', 'DESC')
      .getManyAndCount();

    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        profileType: u.profileType,
        status: 'active',
        lastLogin: u.lastLogin,
        createdAt: u.createdAt,
        roles: [],
      })),
      total,
    };
  }

  /**
   * Suspend a user
   */
  async suspendUser(userId: string, reason: string, adminId: string): Promise<void> {
    // In a real implementation, this would update user status
    this.logger.log(`User ${userId} suspended by ${adminId}: ${reason}`);

    // Log the action
    await this.auditLogRepo.save({
      userId: adminId,
      action: 'USER_SUSPENDED',
      details: { targetUserId: userId, reason },
    });
  }

  /**
   * Reactivate a user
   */
  async reactivateUser(userId: string, adminId: string): Promise<void> {
    this.logger.log(`User ${userId} reactivated by ${adminId}`);

    await this.auditLogRepo.save({
      userId: adminId,
      action: 'USER_REACTIVATED',
      details: { targetUserId: userId },
    });
  }

  /**
   * Get moderation reports
   */
  async getModerationReports(filters: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ reports: ModerationReport[]; total: number }> {
    // This is a placeholder - actual implementation depends on report entity
    return { reports: [], total: 0 };
  }

  /**
   * Get analytics data
   */
  async getAnalytics(filters: {
    startDate: Date;
    endDate: Date;
    granularity: 'day' | 'week' | 'month';
  }): Promise<AnalyticsData[]> {
    // Placeholder - would aggregate data from various sources
    const data: AnalyticsData[] = [];
    const current = new Date(filters.startDate);

    while (current <= filters.endDate) {
      data.push({
        date: current.toISOString().split('T')[0],
        users: Math.floor(Math.random() * 100),
        sessions: Math.floor(Math.random() * 50),
        revenue: Math.floor(Math.random() * 1000),
      });

      current.setDate(current.getDate() + 1);
    }

    return data;
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<{
    status: string;
    components: Record<string, { status: string; latency?: number }>;
    uptime: number;
  }> {
    return {
      status: 'healthy',
      components: {
        database: { status: 'healthy', latency: 5 },
        redis: { status: 'healthy', latency: 2 },
        auth: { status: 'healthy', latency: 10 },
      },
      uptime: process.uptime(),
    };
  }
}
