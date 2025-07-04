import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  public async getProfile(userId: number): Promise<User> {
    return this.userRepository.findOneOrFail({ where: { id: userId } });
  }

  public async updateProfile(
    userId: number,
    updateProfileDto: UpdateProfileDto,
  ): Promise<User> {
    await this.userRepository.update(userId, updateProfileDto);
    return this.getProfile(userId);
  }

  public async updateProfilePicture(
    userId: number,
    profilePicture: string,
  ): Promise<User> {
    await this.userRepository.update(userId, { profilePicture });
    return this.getProfile(userId);
  }
}
