import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, ProfileType } from './entities/user.entity';
import { Role } from '../entities/role.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

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

    const user = this.userRepository.create({
      ...createUserDto,
      walletAddress: createUserDto.walletAddress?.toLowerCase(),
      email: createUserDto.email?.toLowerCase(),
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
