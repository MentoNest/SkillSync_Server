import { Injectable } from '@nestjs/common';
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
    return this.userRepository.findOneOrFail({ where: { id: userId } });
  }

  async updateProfile(userId: number, updateProfileDto: UpdateProfileDto): Promise<User> {
    await this.userRepository.update(userId, updateProfileDto);
    return this.getProfile(userId);
  }

  async updateProfilePicture(userId: number, profilePicture: string): Promise<User> {
    await this.userRepository.update(userId, { profilePicture });
    return this.getProfile(userId);
  }
}