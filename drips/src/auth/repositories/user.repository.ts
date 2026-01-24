import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserRole, UserStatus } from '@libs/common';

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {}

  /**
   * Create a new user with normalized email
   */
  async createUser(
    email: string,
    password_hash: string,
    roles: UserRole[] = [UserRole.MENTEE],
    status: UserStatus = UserStatus.PENDING,
    firstName?: string,
    lastName?: string,
  ): Promise<User> {
    const normalizedEmail = email.toLowerCase();

    const user = this.repository.create({
      email: normalizedEmail,
      password_hash,
      roles,
      status,
      firstName,
      lastName,
    });

    return this.repository.save(user);
  }

  /**
   * Find user by email (case-insensitive)
   */
  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase();
    return this.repository.findOne({
      where: { email: normalizedEmail },
    });
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    return this.repository.findOne({
      where: { id },
    });
  }

  /**
   * List users with pagination
   */
  async listUsers(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ users: User[]; total: number }> {
    const skip = (page - 1) * limit;
    const [users, total] = await this.repository.findAndCount({
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { users, total };
  }

  /**
   * Update user status
   */
  async updateStatus(userId: string, status: UserStatus): Promise<User> {
    await this.repository.update(userId, { status });
    const user = await this.findById(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }
    return user;
  }

  /**
   * Assign roles to user (overwrites existing roles)
   */
  async assignRoles(userId: string, roles: UserRole[]): Promise<User> {
    if (!roles || roles.length === 0) {
      throw new Error('At least one role must be assigned');
    }

    // Validate roles
    const validRoles = Object.values(UserRole);
    const invalidRoles = roles.filter((role) => !validRoles.includes(role));
    if (invalidRoles.length > 0) {
      throw new Error(`Invalid roles: ${invalidRoles.join(', ')}`);
    }

    await this.repository.update(userId, { roles });
    const user = await this.findById(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }
    return user;
  }

  /**
   * Add role to user (append to existing roles)
   */
  async addRole(userId: string, role: UserRole): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    if (!user.roles.includes(role)) {
      user.roles = [...user.roles, role];
      return this.repository.save(user);
    }

    return user;
  }

  /**
   * Remove role from user
   */
  async removeRole(userId: string, role: UserRole): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    if (user.roles.length === 1) {
      throw new Error('User must have at least one role');
    }

    user.roles = user.roles.filter((r: UserRole) => r !== role);
    return this.repository.save(user);
  }

  /**
   * Check if user has a specific role
   */
  async hasRole(userId: string, role: UserRole): Promise<boolean> {
    const user = await this.findById(userId);
    return user?.roles.includes(role) ?? false;
  }

  /**
   * Find all admins
   */
  async findAdmins(): Promise<User[]> {
    return this.repository
      .createQueryBuilder('user')
      .where(':role = ANY(user.roles)', { role: UserRole.ADMIN })
      .getMany();
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string): Promise<void> {
    await this.repository.delete(userId);
  }
}
