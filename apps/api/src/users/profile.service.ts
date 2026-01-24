import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from './entities/profile.entity';
import { User } from './entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
export class ProfilesService {
  constructor(
    @InjectRepository(Profile)
    private readonly profileRepo: Repository<Profile>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async getMe(userId: string) {
    const profile = await this.profileRepo.findOne({
      where: { user: { id: userId } },
    });

    if (!profile) {
      return {
        name: null,
        bio: null,
        timezone: null,
        socials: {},
      };
    }

    return profile;
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    let profile = await this.profileRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!profile) {
      const user = await this.userRepo.findOneBy({ id: userId });
      profile = this.profileRepo.create({ user: user! });
    }

    if (dto.socials) {
      this.validateSocials(dto.socials);
    }

    Object.assign(profile, dto);
    return this.profileRepo.save(profile);
  }

  private validateSocials(socials: Record<string, string>) {
    const allowed = ['github', 'twitter', 'linkedin'];

    for (const key of Object.keys(socials)) {
      if (!allowed.includes(key)) {
        throw new BadRequestException(`Unsupported social key: ${key}`);
      }

      try {
        new URL(socials[key]);
      } catch {
        throw new BadRequestException(`Invalid URL for ${key}`);
      }
    }
  }
}
