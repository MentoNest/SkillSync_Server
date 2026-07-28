import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import { Role } from '../users/entities/role.entity.js';
import { MentorProfile } from '../users/entities/mentor-profile.entity.js';
import { PaginationService } from '../common/pagination/pagination.service.js';
import { AuthRole } from '../common/enums/auth-role.enum.js';
import { UserStatus } from '../users/enums/user-status.enum.js';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(MentorProfile) private readonly mentorRepo: Repository<MentorProfile>,
    private readonly paginationService: PaginationService,
  ) {}

  async getAllUsers(query: {
    page?: number;
    limit?: number;
    status?: UserStatus;
    role?: AuthRole;
    search?: string;
  }) {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('user.mentorProfile', 'mentorProfile')
      .leftJoinAndSelect('user.menteeProfile', 'menteeProfile');

    if (query.status) {
      qb.andWhere('user.status = :status', { status: query.status });
    }

    if (query.role) {
      qb.andWhere('role.name = :role', { role: query.role });
    }

    if (query.search) {
      qb.andWhere(
        '(user.username ILIKE :search OR user.email ILIKE :search OR user.displayName ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    qb.orderBy('user.createdAt', 'DESC');

    return this.paginationService.paginate(qb, query.page || 1, query.limit || 20);
  }

  async getUserById(id: string) {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['roles', 'mentorProfile', 'menteeProfile'],
    });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async suspendUser(id: string, dto: { reason: string; duration?: number }) {
    const user = await this.getUserById(id);
    user.status = UserStatus.SUSPENDED;
    await this.userRepo.save(user);
    this.logger.log(`User ${id} suspended: ${dto.reason}`);
    return { success: true, userId: id, status: 'suspended' };
  }

  async deleteUser(id: string) {
    const user = await this.getUserById(id);
    user.status = UserStatus.DELETED;
    await this.userRepo.save(user);
    this.logger.log(`User ${id} soft-deleted`);
    return { success: true, userId: id, status: 'deleted' };
  }

  async assignRole(userId: string, dto: { role: AuthRole }) {
    const user = await this.getUserById(userId);
    const existingRole = await this.roleRepo.findOne({
      where: { user: { id: userId }, name: dto.role },
    });
    if (!existingRole) {
      const role = this.roleRepo.create({ name: dto.role, user });
      await this.roleRepo.save(role);
    }
    return { success: true, userId, role: dto.role };
  }

  async revokeRole(userId: string, roleId: string) {
    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`);
    }
    await this.roleRepo.remove(role);
    return { success: true, roleId };
  }

  async getUserStats() {
    const total = await this.userRepo.count();
    const active = await this.userRepo.count({
      where: { status: UserStatus.ACTIVE },
    });
    const suspended = await this.userRepo.count({
      where: { status: UserStatus.SUSPENDED },
    });
    const deleted = await this.userRepo.count({
      where: { status: UserStatus.DELETED },
    });

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    return { total, active, suspended, deleted, newThisWeek: 0 };
  }

  async getSessionStats() {
    return { total: 0, active: 0, completed: 0, disputed: 0 };
  }

  async getRevenueStats() {
    return { total: 0, thisMonth: 0, averagePerSession: 0 };
  }

  async getAuditLog(query: { page?: number; limit?: number }) {
    return this.paginationService.paginate(
      this.roleRepo.createQueryBuilder('role').orderBy('role.createdAt', 'DESC'),
      query.page || 1,
      query.limit || 50,
    );
  }
}
