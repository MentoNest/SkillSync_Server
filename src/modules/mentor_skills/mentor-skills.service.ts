import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MentorSkill } from './entities/mentor-skill.entity';
import { Skill } from '../skill/entities/skill.entity';
import { MentorProfile } from '../profile/entities/mentor-profile.entity';
import { SkillPopularityService } from '../skills/providers/skill-popularity.service';
import { SkillStatus } from '../../common/enums/skill-status.enum';

@Injectable()
export class MentorSkillsService {
  constructor(
    @InjectRepository(MentorSkill)
    private mentorSkillRepo: Repository<MentorSkill>,
    @InjectRepository(Skill)
    private skillRepo: Repository<Skill>,
    @InjectRepository(MentorProfile)
    private mentorRepo: Repository<MentorProfile>,
    private readonly popularityService: SkillPopularityService,
  ) {}

  async attachSkills(mentorId: string, skillIds: number[]) {
    const mentor = await this.mentorRepo.findOne({ where: { id: mentorId } });
    if (!mentor) throw new NotFoundException('Mentor not found');
    
    const skills = await this.skillRepo.findByIds(skillIds);
    if (skills.length !== skillIds.length) throw new BadRequestException('Some skills do not exist');
    
    // Validate that all skills are approved
    const nonApprovedSkills = skills.filter(s => s.status !== SkillStatus.APPROVED);
    if (nonApprovedSkills.length > 0) {
      const nonApprovedNames = nonApprovedSkills.map(s => s.name).join(', ');
      throw new BadRequestException(
        `Cannot attach non-approved skills: ${nonApprovedNames}. Skills must be approved before use.`,
      );
    }
    
    const existing = await this.mentorSkillRepo.find({ where: { mentor: { id: mentorId } } });
    const existingSkillIds = new Set(existing.map(ms => ms.skill.id));
    const newSkills = skills.filter(skill => !existingSkillIds.has(skill.id));
    if (!newSkills.length) throw new BadRequestException('All skills already attached');
    const mentorSkills = newSkills.map(skill => this.mentorSkillRepo.create({ mentor, skill }));
    
    // Track popularity for each attached skill
    await this.popularityService.batchIncrement(
      newSkills.map(skill => ({
        skillId: skill.id,
        eventType: 'mentor_skill_attach' as any,
      }))
    );
    
    return this.mentorSkillRepo.save(mentorSkills);
  }

  async detachSkills(mentorId: string, skillIds: number[]) {
    const mentor = await this.mentorRepo.findOne({ where: { id: mentorId } });
    if (!mentor) throw new NotFoundException('Mentor not found');
    const mentorSkills = await this.mentorSkillRepo.find({ where: { mentor: { id: mentorId }, skill: { id: In(skillIds) } } });
    if (!mentorSkills.length) throw new BadRequestException('No matching skills to detach');
    return this.mentorSkillRepo.remove(mentorSkills);
  }

  async getMentorSkills(mentorId: string) {
    const mentorSkills = await this.mentorSkillRepo.find({ where: { mentor: { id: mentorId } }, relations: ['skill'] });
    return mentorSkills.map(ms => ms.skill);
  }
}
