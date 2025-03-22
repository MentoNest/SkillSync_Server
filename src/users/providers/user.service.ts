import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user.entity';
import { CreateUserDto } from '../dto/createUser.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { RedisService } from 'src/common/redis/cache.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private readonly redisService: RedisService
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const user = this.userRepository.create(createUserDto);
    await this.userRepository.save(user);

    // Cache the new user
    await this.redisService.set(`user:${user.id}`, user, 3600);
    await this.redisService.delete('users:all');

    return user;
  }

  async findAll(): Promise<User[]> {
    // Try fetching from cache first
    const cachedUsers = await this.redisService.get<User[]>('users:all');
    if (cachedUsers) {
      return cachedUsers;
    }

    // Fetch from database
    const users = await this.userRepository.find();
    await this.redisService.set('users:all', users, 1800); // Cache for 30 mins

    return users;
  }

  async findOne(id: number): Promise<User> {
    // Try fetching from cache
    const cachedUser = await this.redisService.get<User>(`user:${id}`);
    if (cachedUser) {
      return cachedUser;
    }

    // Fetch from database
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    // Cache the user (1 hour)
    await this.redisService.set(`user:${id}`, user, 3600);
    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    let user = await this.userRepository.preload({ id, ...updateUserDto });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    user = await this.userRepository.save(user);

    // Update cache
    await this.redisService.set(`user:${id}`, user, 3600);
    await this.redisService.delete('users:all');

    return user;
  }

  async remove(id: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    await this.userRepository.delete(id);

    // Remove from cache
    await this.redisService.delete(`user:${id}`);
    await this.redisService.delete('users:all');
  }
}
