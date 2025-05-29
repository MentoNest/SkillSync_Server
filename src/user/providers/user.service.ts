import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { User } from '../entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { classToPlain } from 'class-transformer';
import { Role } from '../../common/enum/role.enum';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getAllUsers(): Promise<Partial<User>[]> {
    const users = await this.userRepository.find({
      where: { isDeleted: false },
    });
    // Using classToPlain to automatically exclude @Exclude() properties like password
    return users.map((user) => classToPlain(user)) as Partial<User>[];
  }

  async getUserById(id: number): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({
      where: { id, isDeleted: false },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Using classToPlain to automatically exclude @Exclude() properties
    return classToPlain(user) as Partial<User>;
  }

  async editUser(
    id: number,
    dto: UpdateUserDto,
    currentUser: User,
  ): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({
      where: { id, isDeleted: false },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Permission check: Only allow users to edit their own profile or admins to edit any profile
    if (currentUser.id !== user.id && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'You do not have permission to edit this user',
      );
    }

    // If email is being updated, check if it's already taken
    if (dto.email && dto.email !== user.email) {
      const emailExists = await this.userRepository.findOne({
        where: { email: dto.email, isDeleted: false },
      });
      if (emailExists) {
        throw new BadRequestException('Email already exists');
      }
    }

    // Prevent role changes unless by admin
    if (dto.role && dto.role !== user.role && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can change user roles');
    }

    // Update only the provided fields
    Object.assign(user, dto);

    // Save the updated user
    const updatedUser = await this.userRepository.save(user);
    return classToPlain(updatedUser) as Partial<User>;
  }

  async deleteUser(id: number, currentUser: User): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id, isDeleted: false },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Permission check: Only allow users to delete their own account or admins to delete any account
    if (currentUser.id !== user.id && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'You do not have permission to delete this user',
      );
    }

    // Soft delete
    user.isDeleted = true;
    await this.userRepository.save(user);
  }

  // Helper method to check if user exists
  async checkUserExists(id: number): Promise<boolean> {
    const count = await this.userRepository.count({
      where: { id, isDeleted: false },
    });
    return count > 0;
  }

  // Helper method to update profile image
  async updateProfileImage(userId: number, imageUrl: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId, isDeleted: false },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    await this.userRepository.update(userId, { profilePicture: imageUrl });
  }
}
