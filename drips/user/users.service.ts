import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { PaginatedUsersResponseDto } from './dto/paginated-users-response.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /**
   * Create a new user
   */
  async create(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    try {
      // Check if user with email already exists
      const existingUser = await this.usersRepository.findOne({
        where: { email: createUserDto.email },
        withDeleted: true,
      });

      if (existingUser) {
        throw new ConflictException(
          `User with email ${createUserDto.email} already exists`,
        );
      }

      // Hash the password
      const passwordHash = await bcrypt.hash(
        createUserDto.password,
        this.SALT_ROUNDS,
      );

      // Create user entity
      const user = this.usersRepository.create({
        email: createUserDto.email,
        passwordHash,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
      });

      // Save to database
      const savedUser = await this.usersRepository.save(user);

      // Return response without password
      return this.toResponseDto(savedUser);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      // Handle unique constraint violation from database
      if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') {
        throw new ConflictException(
          `User with email ${createUserDto.email} already exists`,
        );
      }
      throw new InternalServerErrorException(
        'An error occurred while creating the user',
      );
    }
  }

  /**
   * Find all users with pagination
   */
  async findAll(
    paginationQuery: PaginationQueryDto,
  ): Promise<PaginatedUsersResponseDto> {
    const { page = 1, limit = 10 } = paginationQuery;
    const skip = (page - 1) * limit;

    const [users, total] = await this.usersRepository.findAndCount({
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const data = users.map((user) => this.toResponseDto(user));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find one user by ID
   */
  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.toResponseDto(user);
  }

  /**
   * Find user by email (internal use, includes password hash)
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email },
    });
  }

  /**
   * Update a user
   */
  async update(
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    // Check if user exists
    const user = await this.usersRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    try {
      // Check for email uniqueness if email is being updated
      if (updateUserDto.email && updateUserDto.email !== user.email) {
        const existingUser = await this.usersRepository.findOne({
          where: { email: updateUserDto.email },
          withDeleted: true,
        });

        if (existingUser) {
          throw new ConflictException(
            `User with email ${updateUserDto.email} already exists`,
          );
        }
      }

      // Update fields
      if (updateUserDto.email) user.email = updateUserDto.email;
      if (updateUserDto.firstName) user.firstName = updateUserDto.firstName;
      if (updateUserDto.lastName) user.lastName = updateUserDto.lastName;

      // Update password if provided
      if (updateUserDto.password) {
        user.passwordHash = await bcrypt.hash(
          updateUserDto.password,
          this.SALT_ROUNDS,
        );
      }

      // Save updated user
      const updatedUser = await this.usersRepository.save(user);

      return this.toResponseDto(updatedUser);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      // Handle unique constraint violation from database
      if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') {
        throw new ConflictException(
          `User with email ${updateUserDto.email} already exists`,
        );
      }
      throw new InternalServerErrorException(
        'An error occurred while updating the user',
      );
    }
  }

  /**
   * Soft delete a user
   */
  async remove(id: string): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    await this.usersRepository.softDelete(id);
  }

  /**
   * Convert User entity to UserResponseDto (excludes password)
   */
  private toResponseDto(user: User): UserResponseDto {
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }
}