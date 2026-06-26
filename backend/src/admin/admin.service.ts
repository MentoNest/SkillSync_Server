import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly redisService: RedisService,
  ) {}

  async listUsers(
    page: number,
    limit: number,
  ): Promise<{ users: User[]; total: number }> {
    const [users, total] = await this.userRepo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { users, total };
  }

  async getUser(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  async updateUserRoles(id: string, roles: string[]): Promise<User> {
    const user = await this.getUser(id);
    user.roles = roles;
    return this.userRepo.save(user);
  }

  async suspendUser(id: string): Promise<void> {
    await this.getUser(id);
    await this.redisService.set(id, '1', 0, 'suspended');
  }

  async unsuspendUser(id: string): Promise<void> {
    await this.redisService.del(id, 'suspended');
  }

  async isUserSuspended(id: string): Promise<boolean> {
    const value = await this.redisService.get(id, 'suspended');
    return value !== null;
  }

  async getAnalytics(): Promise<{
    totalUsers: number;
    mentors: number;
    mentees: number;
  }> {
    const users = await this.userRepo.find();
    const totalUsers = users.length;
    const mentors = users.filter((u) => u.roles.includes('mentor')).length;
    const mentees = users.filter((u) => u.roles.includes('mentee')).length;
    return { totalUsers, mentors, mentees };
  }
}
