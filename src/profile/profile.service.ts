import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateProfileDto } from '../user/dto/update-profile.dto';
import { User } from 'src/user/entities/user.entity';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getProfile(userId: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return user;
  }

  async updateProfile(
    userId: number,
    updateProfileDto: UpdateProfileDto,
  ): Promise<User> {
    const user = await this.getProfile(userId);

    // Update only the provided fields
    Object.assign(user, updateProfileDto);

    // Save the updated user
    return await this.userRepository.save(user);
  }

  async updateProfilePicture(
    userId: number,
    profilePicture: string,
  ): Promise<User> {
    const user = await this.getProfile(userId);

    user.profilePicture = profilePicture;
    return await this.userRepository.save(user);
  }
}
