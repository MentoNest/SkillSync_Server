import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { User } from '../../user/entities/user.entity';
import { CreateMentorProfileDto } from '../dto/create-mentor-profile.dto';
import { UpdateMentorProfileDto } from '../dto/update-mentor-profile.dto';
import { ListingsService } from '../../listings/providers/listings.service';
import { ListingType } from '../../listings/entities/listing.entity';

@Injectable()
export class MentorProfileService {
  constructor(
    @InjectRepository(MentorProfile)
    private mentorProfileRepository: Repository<MentorProfile>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private listingsService: ListingsService,
  ) {}

  async create(createMentorProfileDto: CreateMentorProfileDto, userId: string): Promise<MentorProfile> {
    // Check if user exists
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if mentor profile already exists for this user
    const existingProfile = await this.mentorProfileRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (existingProfile) {
      throw new ConflictException('Mentor profile already exists for this user');
    }

    // Optional: Check for similar active listings as a warning (not blocking)
    if (createMentorProfileDto.skills && createMentorProfileDto.skills.length > 0) {
      try {
        const allListings = await this.listingsService.findAll({
          type: ListingType.MENTORSHIP,
          skills: createMentorProfileDto.skills,
        });
        
        // If there are many similar listings, you might want to notify admin or log it
        if (allListings.length > 10) {
          console.log(`High competition area: ${createMentorProfileDto.skills.join(', ')} with ${allListings.length} active listings`);
        }
      } catch (error) {
        // Silently continue if listing service fails - this is optional check
        console.warn('Could not check listing similarity:', error.message);
      }
    }

    // Create mentor profile
    const mentorProfile = this.mentorProfileRepository.create({
      ...createMentorProfileDto,
      user,
    });

    return this.mentorProfileRepository.save(mentorProfile);
  }

  async findByUserId(userId: string): Promise<MentorProfile> {
    const profile = await this.mentorProfileRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }

    return profile;
  }

  async findOne(id: string): Promise<MentorProfile> {
    const profile = await this.mentorProfileRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!profile) {
      throw new NotFoundException('Mentor profile not found');
    }

    return profile;
  }

  async update(id: string, updateMentorProfileDto: UpdateMentorProfileDto): Promise<MentorProfile> {
    const profile = await this.findOne(id);

    Object.assign(profile, updateMentorProfileDto);
    return this.mentorProfileRepository.save(profile);
  }

  async remove(id: string): Promise<void> {
    const profile = await this.findOne(id);
    await this.mentorProfileRepository.remove(profile);
  }

  async findAll(): Promise<MentorProfile[]> {
    return this.mentorProfileRepository.find({
      relations: ['user'],
      where: { isAvailable: true },
    });
  }

  async findBySkills(skills: string[]): Promise<MentorProfile[]> {
    return this.mentorProfileRepository
      .createQueryBuilder('mentorProfile')
      .leftJoinAndSelect('mentorProfile.user', 'user')
      .where('mentorProfile.isAvailable = :isAvailable', { isAvailable: true })
      .andWhere('mentorProfile.skills && :skills', { skills })
      .getMany();
  }
}
