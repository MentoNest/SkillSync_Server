import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User, ProfileType, UserStatus } from './entities/user.entity';
import { UserSuspension } from './entities/user-suspension.entity';
import { Role } from '../entities/role.entity';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { RedisService } from '../auth/services/redis.service';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { AuditLog } from '../auth/entities/audit-log.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserSearchQueryDto } from './dto/user-search-query.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { PublicUserResponseDto } from './dto/public-user-response.dto';
import { USERNAME_PATTERN } from './dto/update-username.dto';

@Injectable()
export class UserService {
  private static readonly USER_SEARCH_CACHE_TTL_SECONDS = 60; // 1 minute

  // #1174: number of days a soft-deleted account can be restored, configurable via env.
  private static readonly DEFAULT_DELETE_GRACE_DAYS = 30;

  // #1176: which status transitions the generic admin status endpoint allows.
  // 'deleted' is intentionally not reachable as a target here except from
  // 'active'/'pending_verification'/'suspended' (see adminSetStatus) - and
  // 'deleted' -> 'active' must go through the dedicated restore flow, which
  // enforces the grace period.
  private static readonly STATUS_TRANSITIONS: Record<UserStatus, UserStatus[]> = {
    [UserStatus.ACTIVE]: [UserStatus.SUSPENDED, UserStatus.DELETED, UserStatus.PENDING_VERIFICATION],
    [UserStatus.PENDING_VERIFICATION]: [UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.DELETED],
    [UserStatus.SUSPENDED]: [UserStatus.ACTIVE, UserStatus.DELETED],
    [UserStatus.DELETED]: [],
  };

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepository: Repository<MentorProfile>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    @InjectRepository(UserSuspension)
    private readonly suspensionRepository: Repository<UserSuspension>,
    private readonly redisService: RedisService,
  ) {}

  // #1177: 30-day cooldown between username changes.
  private static readonly USERNAME_COOLDOWN_DAYS = 30;

  private get deleteGraceDays(): number {
    const configured = parseInt(process.env.DELETE_GRACE_DAYS || '', 10);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : UserService.DEFAULT_DELETE_GRACE_DAYS;
  }

  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    if (!createUserDto.walletAddress && !createUserDto.email) {
      throw new BadRequestException('Either walletAddress or email must be provided');
    }

    if (createUserDto.walletAddress) {
      const existingWallet = await this.userRepository.findOne({
        where: { walletAddress: createUserDto.walletAddress.toLowerCase() },
      });
      if (existingWallet) {
        throw new ConflictException('User with this wallet address already exists');
      }
    }

    if (createUserDto.email) {
      const existingEmail = await this.userRepository.findOne({
        where: { email: createUserDto.email.toLowerCase() },
      });
      if (existingEmail) {
        throw new ConflictException('User with this email already exists');
      }
    }

    // Default role assignment
    const defaultRoleName =
      createUserDto.profileType === ProfileType.MENTOR ? 'mentor' : 'mentee';
    const defaultRole = await this.roleRepository.findOne({
      where: { name: defaultRoleName },
    });

    // #1177: displayName defaults to a wallet-address-derived handle when
    // not supplied and no email-derived alternative is available either.
    const defaultDisplayName = createUserDto.walletAddress
      ? `User_${createUserDto.walletAddress.slice(-6)}`
      : createUserDto.email
        ? createUserDto.email.split('@')[0]
        : undefined;

    const user = this.userRepository.create({
      ...createUserDto,
      walletAddress: createUserDto.walletAddress?.toLowerCase(),
      email: createUserDto.email?.toLowerCase(),
      displayName: createUserDto.displayName || defaultDisplayName,
      roles: defaultRole ? [defaultRole] : [],
      settings: createUserDto.settings || {
        notifications: true,
        theme: 'light',
        emailAlerts: true,
      },
    });

    const savedUser = await this.userRepository.save(user);
    return UserResponseDto.fromEntity(savedUser);
  }

  async findAll(query: UserQueryDto): Promise<{
    data: UserResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const queryBuilder = this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      // #1174/#1176: this is a public listing endpoint - never surface
      // suspended, deleted, or not-yet-active accounts.
      .where('user.status = :activeStatus', { activeStatus: UserStatus.ACTIVE })
      .skip(skip)
      .take(limit)
      .orderBy('user.createdAt', 'DESC');

    if (query.profileType) {
      queryBuilder.andWhere('user.profileType = :profileType', {
        profileType: query.profileType,
      });
    }

    if (query.search) {
      queryBuilder.andWhere(
        '(LOWER(user.displayName) LIKE LOWER(:search) OR LOWER(user.email) LIKE LOWER(:search) OR LOWER(user.walletAddress) LIKE LOWER(:search))',
        { search: `%${query.search}%` },
      );
    }

    const [users, total] = await queryBuilder.getManyAndCount();

    return {
      data: users.map((u) => UserResponseDto.fromEntity(u)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * #1173: Search users by role with filtering, pagination, sorting and caching.
   * - role filter matches users assigned that role
   * - search performs case-insensitive partial matching on displayName (ILIKE)
   * - skill filter applies to mentor profiles only (skills array contains value)
   * - sortBy: name | createdAt | rating (mentors only, non-mentors sort last)
   * - Common results are cached in Redis for 1 minute (admin views bypass cache)
   */
  async searchUsers(
    query: UserSearchQueryDto,
    isAdmin = false,
  ): Promise<{
    data: PublicUserResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = Math.min(query.limit && query.limit > 0 ? query.limit : 20, 100);
    const skip = (page - 1) * limit;
    const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Serve common search results from Redis cache (public views only)
    const cacheKey = `users:search:${JSON.stringify({
      role: query.role || null,
      search: query.search || null,
      skill: query.skill || null,
      page,
      limit,
      sortBy: query.sortBy || 'createdAt',
      sortOrder,
    })}`;
    if (!isAdmin) {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          // Ignore corrupted cache entries and re-query
        }
      }
    }

    const queryBuilder = this.userRepository.createQueryBuilder('user');

    // #1174/#1176: this is a public search endpoint - never surface
    // suspended, deleted, or not-yet-active accounts.
    queryBuilder.andWhere('user.status = :status', { status: UserStatus.ACTIVE });

    // Role filter: only users that hold the given role (case-insensitive)
    if (query.role) {
      const roleUserSubQuery = this.roleRepository
        .createQueryBuilder('role')
        .select('roleUser.id')
        .innerJoin('role.users', 'roleUser')
        .where('LOWER(role.name) = LOWER(:role)');
      queryBuilder
        .andWhere(`user.id IN (${roleUserSubQuery.getQuery()})`)
        .setParameter('role', query.role);
    }

    // Skill filter: mentor profiles only (skills array contains the value)
    if (query.skill) {
      const mentorSkillSubQuery = this.mentorProfileRepository
        .createQueryBuilder('mentorProfile')
        .select('mentorProfile.userId')
        .where(':skill = ANY(mentorProfile.skills)');
      queryBuilder
        .andWhere(`user.id IN (${mentorSkillSubQuery.getQuery()})`)
        .setParameter('skill', query.skill);
    }

    // Display name search: case-insensitive partial matching (PostgreSQL ILIKE)
    if (query.search) {
      queryBuilder.andWhere('user.displayName ILIKE :search', {
        search: `%${query.search}%`,
      });
    }

    // Sorting
    if (query.sortBy === 'name') {
      queryBuilder.orderBy('user.displayName', sortOrder, 'NULLS LAST');
    } else if (query.sortBy === 'rating') {
      queryBuilder
        .leftJoin(MentorProfile, 'mentorProfile', 'mentorProfile.userId = user.id')
        .orderBy('mentorProfile.averageRating', sortOrder, 'NULLS LAST');
    } else {
      queryBuilder.orderBy('user.createdAt', sortOrder);
    }

    queryBuilder.skip(skip).take(limit);

    const [users, total] = await queryBuilder.getManyAndCount();

    // Enrich mentor results with skills and average rating
    const userIds = users.map((u) => u.id);
    const mentorProfiles = userIds.length
      ? await this.mentorProfileRepository.find({ where: { userId: In(userIds) } })
      : [];
    const profileByUserId = new Map(mentorProfiles.map((p) => [p.userId, p]));

    const result = {
      data: users.map((u) =>
        PublicUserResponseDto.fromEntity(u, profileByUserId.get(u.id), isAdmin),
      ),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    if (!isAdmin) {
      await this.redisService.set(cacheKey, JSON.stringify(result), UserService.USER_SEARCH_CACHE_TTL_SECONDS);
    }

    return result;
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { roles: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return user;
  }

  async findUserResponseById(id: string): Promise<UserResponseDto> {
    const user = await this.findById(id);
    return UserResponseDto.fromEntity(user);
  }

  async findByWalletAddress(walletAddress: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { walletAddress: walletAddress.toLowerCase() },
      relations: { roles: true },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.toLowerCase() },
      relations: { roles: true },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.findById(id);

    if (updateUserDto.email && updateUserDto.email.toLowerCase() !== user.email) {
      const existing = await this.findByEmail(updateUserDto.email);
      if (existing && existing.id !== id) {
        throw new ConflictException('Email is already taken by another user');
      }
      user.email = updateUserDto.email.toLowerCase();
    }

    if (updateUserDto.displayName !== undefined) {
      user.displayName = updateUserDto.displayName;
    }
    if (updateUserDto.bio !== undefined) {
      user.bio = updateUserDto.bio;
    }
    if (updateUserDto.avatarUrl !== undefined) {
      user.avatarUrl = updateUserDto.avatarUrl;
    }
    if (updateUserDto.profileType !== undefined) {
      user.profileType = updateUserDto.profileType;
    }
    if (updateUserDto.settings !== undefined) {
      user.settings = { ...user.settings, ...updateUserDto.settings };
    }

    const updatedUser = await this.userRepository.save(user);
    return UserResponseDto.fromEntity(updatedUser);
  }

  async remove(id: string): Promise<{ success: boolean; message: string }> {
    const user = await this.findById(id);
    await this.userRepository.remove(user);
    return {
      success: true,
      message: `User with ID "${id}" successfully deleted`,
    };
  }

  /**
   * #1174: DELETE /user/account - soft-deletes the caller's own account.
   * Sets status to 'deleted', stamps deletedAt, and immediately invalidates
   * all of the user's active sessions (access tokens via tokenVersion bump,
   * refresh tokens via deletion).
   */
  async softDeleteAccount(userId: string): Promise<{
    success: boolean;
    message: string;
    deletedAt: Date;
    graceDays: number;
  }> {
    const user = await this.findById(userId);

    if (user.status === UserStatus.DELETED) {
      throw new BadRequestException('Account is already deleted');
    }

    user.status = UserStatus.DELETED;
    user.deletedAt = new Date();
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await this.userRepository.save(user);
    await this.invalidateSessions(userId);

    return {
      success: true,
      message: `Account soft-deleted. You can restore it within ${this.deleteGraceDays} days by logging in and calling POST /user/account/restore.`,
      deletedAt: user.deletedAt,
      graceDays: this.deleteGraceDays,
    };
  }

  /**
   * #1174: POST /user/account/restore - reactivates the caller's own
   * account if it was soft-deleted within the configurable grace period.
   */
  async restoreAccount(userId: string): Promise<UserResponseDto> {
    const user = await this.findById(userId);

    if (user.status !== UserStatus.DELETED) {
      throw new BadRequestException('Account is not deleted, nothing to restore');
    }

    const deadline = this.restoreDeadline(user);
    if (deadline && new Date() > deadline) {
      throw new ForbiddenException(
        `The ${this.deleteGraceDays}-day restore grace period ended on ${deadline.toISOString()}. This account can no longer be restored.`,
      );
    }

    user.status = UserStatus.ACTIVE;
    user.deletedAt = null;
    const saved = await this.userRepository.save(user);
    return UserResponseDto.fromEntity(saved);
  }

  /**
   * #1174: admin-only. Permanently (hard) deletes a soft-deleted user once
   * their restore grace period has elapsed.
   */
  async permanentlyDeleteAccount(
    userId: string,
    adminId: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.findById(userId);

    if (user.status !== UserStatus.DELETED) {
      throw new BadRequestException('Only soft-deleted accounts can be permanently deleted');
    }

    const deadline = this.restoreDeadline(user);
    if (deadline && new Date() < deadline) {
      throw new ForbiddenException(
        `Cannot permanently delete before the restore grace period ends (${deadline.toISOString()})`,
      );
    }

    await this.invalidateSessions(userId);
    await this.userRepository.remove(user);
    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId: adminId,
        eventType: 'user_permanently_deleted',
        metadata: { targetUserId: userId },
      }),
    );

    return { success: true, message: `User ${userId} permanently deleted` };
  }

  /**
   * #1174: admin visibility into soft-deleted accounts.
   */
  async findDeletedUsers(): Promise<UserResponseDto[]> {
    const users = await this.userRepository.find({
      where: { status: UserStatus.DELETED },
      relations: { roles: true },
      order: { deletedAt: 'DESC' },
    });
    return users.map((u) => UserResponseDto.fromEntity(u));
  }

  /**
   * #1176: generic admin status-change endpoint backing PATCH
   * /admin/users/:userId/status. Validates the transition against
   * STATUS_TRANSITIONS - notably 'deleted' -> 'active' is rejected here
   * since that must go through restoreAccount() so the grace period is
   * enforced.
   */
  async adminSetStatus(
    userId: string,
    newStatus: UserStatus,
    adminId: string,
  ): Promise<UserResponseDto> {
    const user = await this.findById(userId);
    const previousStatus = user.status;

    if (previousStatus === newStatus) {
      throw new BadRequestException(`User is already ${newStatus}`);
    }

    const allowed = UserService.STATUS_TRANSITIONS[previousStatus] || [];
    if (!allowed.includes(newStatus)) {
      const hint =
        previousStatus === UserStatus.DELETED
          ? ' Use POST /user/account/restore (self-service) instead.'
          : '';
      throw new BadRequestException(
        `Cannot transition user status from '${previousStatus}' to '${newStatus}'.${hint}`,
      );
    }

    user.status = newStatus;
    user.deletedAt = newStatus === UserStatus.DELETED ? new Date() : null;
    if (newStatus !== UserStatus.ACTIVE) {
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      await this.invalidateSessions(userId);
    }

    const saved = await this.userRepository.save(user);

    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId: adminId,
        eventType: 'user_status_changed',
        metadata: { targetUserId: userId, from: previousStatus, to: newStatus },
      }),
    );

    return UserResponseDto.fromEntity(saved);
  }

  /**
   * #1175: POST /admin/users/:userId/suspend - suspends a user temporarily
   * (durationDays set) or permanently (durationDays null/undefined).
   * Immediately invalidates the user's active sessions.
   */
  async suspendUser(
    targetUserId: string,
    reason: string,
    durationDays: number | null | undefined,
    adminId: string,
  ): Promise<UserSuspension> {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('A suspension reason is required');
    }

    const user = await this.findById(targetUserId);
    if (user.status === UserStatus.SUSPENDED) {
      throw new BadRequestException('User is already suspended');
    }
    if (user.status === UserStatus.DELETED) {
      throw new BadRequestException('Cannot suspend a deleted account');
    }

    // Deactivate any stale suspension rows for this user (defensive - there
    // should only ever be one active suspension at a time).
    await this.suspensionRepository.update(
      { userId: targetUserId, isActive: true },
      { isActive: false, liftedAt: new Date(), liftReason: 'superseded' },
    );

    const suspendedUntil =
      durationDays === null || durationDays === undefined
        ? null
        : new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    const suspension = await this.suspensionRepository.save(
      this.suspensionRepository.create({
        userId: targetUserId,
        reason: reason.trim(),
        suspendedBy: adminId,
        suspendedUntil,
        isActive: true,
      }),
    );

    user.status = UserStatus.SUSPENDED;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await this.userRepository.save(user);
    // #1175: suspended user's active sessions are invalidated immediately.
    await this.invalidateSessions(targetUserId);

    return suspension;
  }

  /**
   * #1175: POST /admin/users/:userId/unsuspend - lifts an active
   * suspension. `unsuspendedBy` is an admin id for admin-initiated lifts,
   * or null when called from an automatic expiry check (login/guard).
   */
  async unsuspendUser(targetUserId: string, unsuspendedBy: string | null): Promise<void> {
    const user = await this.findById(targetUserId);
    if (user.status !== UserStatus.SUSPENDED) {
      throw new BadRequestException('User is not currently suspended');
    }

    const activeSuspension = await this.getActiveSuspension(targetUserId);
    if (activeSuspension) {
      activeSuspension.isActive = false;
      activeSuspension.liftedAt = new Date();
      activeSuspension.liftedBy = unsuspendedBy;
      activeSuspension.liftReason = unsuspendedBy ? 'unsuspended' : 'expired';
      await this.suspensionRepository.save(activeSuspension);
    }

    user.status = UserStatus.ACTIVE;
    await this.userRepository.save(user);
  }

  /**
   * #1175: the currently-effective suspension record for a user, if any.
   */
  async getActiveSuspension(userId: string): Promise<UserSuspension | null> {
    return this.suspensionRepository.findOne({
      where: { userId, isActive: true },
      order: { suspendedAt: 'DESC' },
    });
  }

  /**
   * #1175: checked at login. If the user is suspended, returns the active
   * suspension detail. A temporary suspension whose window has already
   * passed is auto-lifted (status flipped back to active) and null is
   * returned so login can proceed.
   */
  async checkAndExpireSuspension(user: User): Promise<UserSuspension | null> {
    if (user.status !== UserStatus.SUSPENDED) {
      return null;
    }

    const activeSuspension = await this.getActiveSuspension(user.id);
    if (activeSuspension?.suspendedUntil && new Date() > new Date(activeSuspension.suspendedUntil)) {
      await this.unsuspendUser(user.id, null);
      user.status = UserStatus.ACTIVE;
      return null;
    }

    return activeSuspension;
  }

  /**
   * #1174/#1175: invalidates a user's active sessions immediately - deletes
   * stored refresh tokens so they can no longer mint new access tokens.
   * Combined with a tokenVersion bump (done by the caller) this makes both
   * existing access tokens and refresh tokens unusable right away.
   */
  private async invalidateSessions(userId: string): Promise<void> {
    await this.refreshTokenRepository.delete({ userId });
  }

  private restoreDeadline(user: User): Date | null {
    if (!user.deletedAt) {
      return null;
    }
    return new Date(user.deletedAt.getTime() + this.deleteGraceDays * 24 * 60 * 60 * 1000);
  }

  /**
   * #1174: sweeps soft-deleted accounts whose restore grace period has
   * elapsed and permanently removes them.
   *
   * TODO: this repo doesn't currently have a job scheduler wired up
   * (no @nestjs/schedule or equivalent dependency). Once one is added,
   * call this from a daily cron (e.g. `@Cron(CronExpression.EVERY_DAY_AT_3AM)`).
   * Until then this can be invoked manually/via a one-off script.
   */
  async purgeExpiredDeletedAccounts(): Promise<{ purgedCount: number; purgedUserIds: string[] }> {
    const candidates = await this.userRepository.find({ where: { status: UserStatus.DELETED } });
    const purgedUserIds: string[] = [];

    for (const user of candidates) {
      const deadline = this.restoreDeadline(user);
      if (deadline && new Date() > deadline) {
        await this.invalidateSessions(user.id);
        await this.userRepository.remove(user);
        purgedUserIds.push(user.id);
      }
    }

    if (purgedUserIds.length > 0) {
      await this.auditLogRepository.save(
        this.auditLogRepository.create({
          userId: null,
          eventType: 'user_accounts_purged',
          metadata: { purgedUserIds, purgedCount: purgedUserIds.length },
        }),
      );
    }

    return { purgedCount: purgedUserIds.length, purgedUserIds };
  }

  /**
   * #1177: PATCH /user/username - changes the caller's username, enforcing
   * the 30-day cooldown and DB-level uniqueness (case-insensitive).
   */
  async changeUsername(userId: string, newUsername: string): Promise<UserResponseDto> {
    const user = await this.findById(userId);
    const normalized = newUsername.toLowerCase();

    if (!USERNAME_PATTERN.test(newUsername)) {
      throw new BadRequestException(
        'username must be 3-30 characters, alphanumeric with underscores/dashes only, and cannot start/end with or repeat a special character',
      );
    }

    if (user.username === normalized) {
      throw new BadRequestException('This is already your username');
    }

    if (user.usernameChangedAt) {
      const cooldownEnds = new Date(
        user.usernameChangedAt.getTime() + UserService.USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
      );
      if (new Date() < cooldownEnds) {
        throw new ForbiddenException(
          `Username can only be changed once every ${UserService.USERNAME_COOLDOWN_DAYS} days. Try again after ${cooldownEnds.toISOString()}.`,
        );
      }
    }

    const existing = await this.userRepository.findOne({ where: { username: normalized } });
    if (existing && existing.id !== userId) {
      throw new ConflictException('This username is already taken');
    }

    const previousUsername = user.username;
    user.username = normalized;
    user.usernameChangedAt = new Date();
    const saved = await this.userRepository.save(user);

    // #1177: username changes logged in the audit log
    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId,
        eventType: 'username_changed',
        metadata: { previousUsername, newUsername: normalized },
      }),
    );

    return UserResponseDto.fromEntity(saved);
  }

  /**
   * #1177: GET /user/username/available - checks format validity and
   * DB-level availability (case-insensitive).
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    if (!USERNAME_PATTERN.test(username)) {
      return false;
    }
    const existing = await this.userRepository.findOne({ where: { username: username.toLowerCase() } });
    return !existing;
  }

  /**
   * #1177: username-based lookup for public profile pages.
   */
  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { username: username.toLowerCase() },
      relations: { roles: true },
    });
  }

  /**
   * #1174/#1177: id-based lookup for public profile pages - returns null
   * (instead of throwing) for a missing or non-active user, so callers can
   * respond 404 without leaking deleted/suspended account existence.
   */
  async findByIdIfActive(id: string): Promise<User | null> {
    const user = await this.userRepository.findOne({ where: { id }, relations: { roles: true } });
    return user && user.status === UserStatus.ACTIVE ? user : null;
  }

  async incrementTokenVersion(userId: string): Promise<number> {
    const user = await this.findById(userId);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await this.userRepository.save(user);
    return user.tokenVersion;
  }

  async lockAccount(userId: string, durationMinutes: number = 30): Promise<User> {
    const user = await this.findById(userId);
    user.isLocked = true;
    user.lockoutUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
    return this.userRepository.save(user);
  }

  async unlockAccount(userId: string): Promise<User> {
    const user = await this.findById(userId);
    user.isLocked = false;
    user.lockoutUntil = null;
    return this.userRepository.save(user);
  }

  async recordLogin(userId: string, ipAddress?: string): Promise<void> {
    await this.userRepository.update(userId, {
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress || null,
    });
  }
}
