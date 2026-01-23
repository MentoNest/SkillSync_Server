import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MentorSkill } from '../users/entities/mentor-skill.entity';
import { MentorProfile } from '../users/entities/mentor-profile.entity';
import { Skill } from '../users/entities/skill.entity';
import { AttachSkillDto, UpdateSkillDto } from '../dtos/mentor-skill.dto';

@Injectable()
export class MentorSkillService {
  constructor(
    @InjectRepository(MentorSkill)
    private mentorSkillRepository: Repository<MentorSkill>,
    @InjectRepository(MentorProfile)
    private mentorProfileRepository: Repository<MentorProfile>,
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
  ) {}

  async attachSkill(
    userId: string,
    attachSkillDto: AttachSkillDto,
  ): Promise<MentorSkill> {
    // Find mentor profile
    const mentorProfile = await this.mentorProfileRepository.findOne({
      where: { userId },
    });

    if (!mentorProfile) {
      throw new NotFoundException('Mentor profile not found');
    }

    // Verify skill exists
    const skill = await this.skillRepository.findOne({
      where: { id: attachSkillDto.skillId },
    });

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    // Check if skill already attached
    const existingMentorSkill = await this.mentorSkillRepository.findOne({
      where: {
        mentorProfileId: mentorProfile.id,
        skillId: attachSkillDto.skillId,
      },
    });

    if (existingMentorSkill) {
      throw new ConflictException('Skill already attached to this mentor');
    }

    // Create mentor skill
    const mentorSkill = this.mentorSkillRepository.create({
      mentorProfileId: mentorProfile.id,
      skillId: attachSkillDto.skillId,

      level: attachSkillDto.level,
      yearsExperience: attachSkillDto.yearsExperience,
    });

    return await this.mentorSkillRepository.save(mentorSkill);
  }

  async updateSkill(
    userId: string,
    skillId: string,
    updateSkillDto: UpdateSkillDto,
  ): Promise<MentorSkill> {
    const mentorProfile = await this.mentorProfileRepository.findOne({
      where: { userId },
    });

    if (!mentorProfile) {
      throw new NotFoundException('Mentor profile not found');
    }

    const mentorSkill = await this.mentorSkillRepository.findOne({
      where: {
        mentorProfileId: mentorProfile.id,
        skillId,
      },
    });

    if (!mentorSkill) {
      throw new NotFoundException('Mentor skill not found');
    }

    mentorSkill.level = updateSkillDto.level;
    mentorSkill.yearsExperience = updateSkillDto.yearsExperience;

    return await this.mentorSkillRepository.save(mentorSkill);
  }

  async detachSkill(userId: string, skillId: string): Promise<void> {
    const mentorProfile = await this.mentorProfileRepository.findOne({
      where: { userId },
    });

    if (!mentorProfile) {
      throw new NotFoundException('Mentor profile not found');
    }

    const result = await this.mentorSkillRepository.delete({
      mentorProfileId: mentorProfile.id,
      skillId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Mentor skill not found');
    }
  }

  async getMentorSkills(userId: string): Promise<MentorSkill[]> {
    const mentorProfile = await this.mentorProfileRepository.findOne({
      where: { userId },
    });

    if (!mentorProfile) {
      throw new NotFoundException('Mentor profile not found');
    }

    return await this.mentorSkillRepository.find({
      where: { mentorProfileId: mentorProfile.id },
      relations: ['skill'],
    });
  }

  async findMentorsBySkills(skillIds: string[]): Promise<MentorProfile[]> {
    if (!skillIds || skillIds.length === 0) {
      return [];
    }

    const mentorSkills = await this.mentorSkillRepository
      .createQueryBuilder('mentorSkill')
      .select('mentorSkill.mentorProfileId')
      .where('mentorSkill.skillId IN (:...skillIds)', { skillIds })
      .groupBy('mentorSkill.mentorProfileId')
      .having('COUNT(DISTINCT mentorSkill.skillId) = :count', {
        count: skillIds.length,
      })
      .getRawMany();

    const mentorProfileIds = mentorSkills.map(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
      (ms) => ms.mentorSkill_mentorProfileId,
    );

    if (mentorProfileIds.length === 0) {
      return [];
    }

    return await this.mentorProfileRepository.find({
      where: { id: In(mentorProfileIds) },
      relations: ['user', 'mentorSkills', 'mentorSkills.skill'],
    });
  }
}
