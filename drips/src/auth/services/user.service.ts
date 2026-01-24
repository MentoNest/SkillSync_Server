import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRepository } from '../repositories/user.repository';
import { User } from '../entities/user.entity';
import { UserRole, UserStatus } from '@libs/common';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  /**
   * Create a new user with validation
   */
  async createUser(
    email: string,
    password: string,
    roles?: UserRole[],
    status?: UserStatus,
    firstName?: string,
    lastName?: string,
  ): Promise<User> {
    // Validate email format
    if (!this.isValidEmail(email)) {
      throw new BadRequestException('Invalid email format');
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase();

    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    // Validate roles if provided
    if (roles && roles.length > 0) {
      this.validateRoles(roles);
    } else {
      roles = [UserRole.MENTEE];
    }

    // Validate status if provided
    if (status && !Object.values(UserStatus).includes(status)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }

    // Create user with normalized email and provided password (hashing is out of scope)
    return this.userRepository.createUser(
      normalizedEmail,
      password,
      roles,
      status || UserStatus.PENDING,
      firstName,
      lastName,
    );
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    return user;
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User> {
    const normalizedEmail = email.toLowerCase();
    const user = await this.userRepository.findByEmail(normalizedEmail);
    if (!user) {
      throw new NotFoundException(`User with email ${normalizedEmail} not found`);
    }
    return user;
  }

  /**
   * List all users with pagination
   */
  async listUsers(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ users: User[]; total: number; page: number; limit: number }> {
    // Validate pagination parameters
    if (page < 1) {
      throw new BadRequestException('Page must be greater than 0');
    }
    if (limit < 1 || limit > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    const { users, total } = await this.userRepository.listUsers(page, limit);
    return { users, total, page, limit };
  }

  /**
   * Update user status
   */
  async updateUserStatus(userId: string, status: UserStatus): Promise<User> {
    if (!Object.values(UserStatus).includes(status)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }

    try {
      return await this.userRepository.updateStatus(userId, status);
    } catch (error) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
  }

  /**
   * Assign roles to user (overwrites existing roles)
   */
  async assignRoles(userId: string, roles: UserRole[]): Promise<User> {
    if (!roles || roles.length === 0) {
      throw new BadRequestException('At least one role must be assigned');
    }

    this.validateRoles(roles);

    try {
      return await this.userRepository.assignRoles(userId, roles);
    } catch (error) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
  }

  /**
   * Add a role to user
   */
  async addRole(userId: string, role: UserRole): Promise<User> {
    if (!Object.values(UserRole).includes(role)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }

    try {
      return await this.userRepository.addRole(userId, role);
    } catch (error) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
  }

  /**
   * Remove a role from user
   */
  async removeRole(userId: string, role: UserRole): Promise<User> {
    if (!Object.values(UserRole).includes(role)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }

    try {
      return await this.userRepository.removeRole(userId, role);
    } catch (error) {
      if (error instanceof Error && error.message.includes('at least one role')) {
        throw new BadRequestException('User must have at least one role');
      }
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
  }

  /**
   * Check if user has a specific role
   */
  async hasRole(userId: string, role: UserRole): Promise<boolean> {
    return this.userRepository.hasRole(userId, role);
  }

  /**
   * Check if user is admin
   */
  async isAdmin(userId: string): Promise<boolean> {
    return this.hasRole(userId, UserRole.ADMIN);
  }

  /**
   * Get all admins
   */
  async getAdmins(): Promise<User[]> {
    return this.userRepository.findAdmins();
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string): Promise<void> {
    await this.userRepository.deleteUser(userId);
  }

  // Helper methods

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate roles
   */
  private validateRoles(roles: UserRole[]): void {
    const validRoles = Object.values(UserRole);
    const invalidRoles = roles.filter((role) => !validRoles.includes(role));
    if (invalidRoles.length > 0) {
      throw new BadRequestException(
        `Invalid roles: ${invalidRoles.join(', ')}. Valid roles are: ${validRoles.join(', ')}`,
      );
    }
  }
}
