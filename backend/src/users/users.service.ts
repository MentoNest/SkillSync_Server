import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { ResourceNotFoundException } from '../common/exceptions/resource-not-found.exception';
import { normalizeWalletAddress } from '../common/utils/wallet-address';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { User } from './entities/user.entity';

export interface UserSearchResult {
  items: User[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id }, relations: { roles: true } });
  }

  async findByWalletAddress(walletAddress: string): Promise<User | null> {
    return this.users.findOne({
      where: { walletAddress: normalizeWalletAddress(walletAddress) },
      relations: { roles: true },
    });
  }

  async findOrCreateByWallet(dto: CreateUserDto): Promise<User> {
    const walletAddress = normalizeWalletAddress(dto.walletAddress);
    const existing = await this.users.findOne({
      where: { walletAddress },
      relations: { roles: true },
    });
    if (existing) {
      return existing;
    }
    const deleted = await this.users.findOne({
      where: { walletAddress },
      relations: { roles: true },
      withDeleted: true,
    });
    if (deleted) {
      deleted.deletedAt = null;
      deleted.status = 'active';
      if (dto.email) {
        deleted.email = dto.email;
      }
      if (dto.displayName) {
        deleted.displayName = dto.displayName;
      }
      return this.users.save(deleted);
    }
    return this.users.save(
      this.users.create({
        walletAddress,
        email: dto.email ?? null,
        displayName: dto.displayName ?? null,
      }),
    );
  }

  async recordLogin(userId: string): Promise<User | null> {
    const user = await this.users.findOne({ where: { id }, relations: { roles: true } });
    if (!user) {
      return null;
    }
    user.lastLoginAt = new Date();
    return this.users.save(user);
  }

  async getOwnProfile(userId: string): Promise<User> {
    const user = await this.users.findOne({ where: { id: userId }, relations: { roles: true } });
    if (!user) {
      throw new ResourceNotFoundException(`User ${userId} was not found`);
    }
    return user;
  }

  async updateOwnProfile(userId: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.getOwnProfile(userId);
    if (dto.email && dto.email !== user.email) {
      const clash = await this.users.findOne({ where: { email: dto.email } });
      if (clash && clash.id !== user.id) {
        throw new ConflictException('That email address is already in use');
      }
    }
    if (dto.email !== undefined) {
      user.email = dto.email;
    }
    if (dto.displayName !== undefined) {
      user.displayName = dto.displayName;
    }
    if (dto.avatarUrl !== undefined) {
      user.avatarUrl = dto.avatarUrl;
    }
    if (dto.timezone !== undefined) {
      user.timezone = dto.timezone;
    }
    if (dto.locale !== undefined) {
      user.locale = dto.locale;
    }
    return this.users.save(user);
  }

  async deleteOwnProfile(userId: string): Promise<User> {
    const user = await this.getOwnProfile(userId);
    user.status = 'deleted';
    user.deletedAt = new Date();
    return this.users.save(user);
  }

  async searchUsers(query: UserQueryDto): Promise<UserSearchResult> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const base: FindOptionsWhere<User> = {};
    if (query.role) {
      base.roles = { name: query.role };
    }
    if (query.status) {
      base.status = query.status;
    }
    const conditions: FindOptionsWhere<User>[] = [];
    if (query.q) {
      const term = `%${query.q}%`;
      for (const field of ['displayName', 'email', 'walletAddress'] as const) {
        conditions.push({ ...base, [field]: ILike(term) } as FindOptionsWhere<User>);
      }
    } else {
      conditions.push(base);
    }
    const [items, total] = await this.users.findAndCount({
      where: conditions.length > 0 ? conditions : {},
      relations: { roles: true },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { items, total, page, limit };
  }
}
