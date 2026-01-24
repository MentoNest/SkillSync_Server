import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class ProfileService {
  constructor(private readonly usersService: UsersService) {}

  async getProfile(userId: string): Promise<User> {
    return this.usersService.findById(userId);
  }

  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<User> {
    // Only allow updating specific profile fields
    const allowedFields: (keyof UpdateProfileDto)[] = [
      'name',
      'bio',
      'avatarUrl',
      'timezone',
    ];

    const updateData: Partial<User> = {};
    for (const field of allowedFields) {
      if (updateProfileDto[field] !== undefined) {
        updateData[field] = updateProfileDto[field];
      }
    }

    return this.usersService.update(userId, updateData);
  }
}