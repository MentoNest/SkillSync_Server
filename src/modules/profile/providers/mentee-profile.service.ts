import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenteeProfile } from '../entities/mentee-profile.entity';
import { User } from '../../user/entities/user.entity';
import { CreateMenteeProfileDto } from '../dto/create-mentee-profile.dto';
import { UpdateMenteeProfileDto } from '../dto/update-mentee-profile.dto';

@Injectable()
export class MenteeProfileService {
  constructor(
    @InjectRepository(MenteeProfile)
    private menteeProfileRepository: Repository<MenteeProfile>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async create(createMenteeProfileDto: CreateMenteeProfileDto, userId: string): Promise<MenteeProfile> {
    // Check if user exists
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if mentee profile already exists for this user
    const existingProfile = await this.menteeProfileRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (existingProfile) {
      throw new ConflictException('Mentee profile already exists for this user');
    }

    // Create mentee profile
    const menteeProfile = this.menteeProfileRepository.create({
      ...createMenteeProfileDto,
      user,
    });

    return this.menteeProfileRepository.save(menteeProfile);
  }

  async findByUserId(userId: string): Promise<MenteeProfile> {
    const profile = await this.menteeProfileRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!profile) {
      throw new NotFoundException('Mentee profile not found');
    }

    return profile;
  }

  async findOne(id: string): Promise<MenteeProfile> {
    const profile = await this.menteeProfileRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!profile) {
      throw new NotFoundException('Mentee profile not found');
    }

    return profile;
  }

  async update(id: string, updateMenteeProfileDto: UpdateMenteeProfileDto): Promise<MenteeProfile> {
    const profile = await this.findOne(id);

    Object.assign(profile, updateMenteeProfileDto);
    return this.menteeProfileRepository.save(profile);
  }

  async remove(id: string): Promise<void> {
    const profile = await this.findOne(id);
    await this.menteeProfileRepository.remove(profile);
  }

  async findAll(): Promise<MenteeProfile[]> {
    return this.menteeProfileRepository.find({
      relations: ['user'],
      where: { isSeekingMentor: true },
    });
  }

  async findByInterests(interests: string[]): Promise<MenteeProfile[]> {
    return this.menteeProfileRepository
      .createQueryBuilder('menteeProfile')
      .leftJoinAndSelect('menteeProfile.user', 'user')
      .where('menteeProfile.isSeekingMentor = :isSeekingMentor', { isSeekingMentor: true })
      .andWhere('menteeProfile.interests && :interests', { interests })
      .getMany();
  }

  async findByGoal(goal: string): Promise<MenteeProfile[]> {
    return this.menteeProfileRepository.find({
      relations: ['user'],
      where: { 
        isSeekingMentor: true,
        primaryGoal: goal as any,
      },
    });
  }
}
