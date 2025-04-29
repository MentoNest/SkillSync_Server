import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UpdateProfileDto } from '../dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getProfile(userId: number): Promise<User> {
    const user = await this.userRepository.findOne({ 
      where: { id: userId }
    });
    
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    
    return user;
  }

  async updateProfile(userId: number, updateProfileDto: UpdateProfileDto): Promise<User> {
    const user = await this.userRepository.findOne({ 
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    // Update only the provided fields
    Object.assign(user, updateProfileDto);

    // Save the updated user
    return await this.userRepository.save(user);
  }

  async updateProfilePicture(userId: number, profilePicturePath: string): Promise<User> {
    const user = await this.userRepository.findOne({ 
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    user.profilePicture = profilePicturePath;
    return await this.userRepository.save(user);
  }
}