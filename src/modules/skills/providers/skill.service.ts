import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository, In } from 'typeorm';
import { Skill } from '../entities/skill.entity';
import { SkillCategory } from '../entities/skill-category.entity';
import { CreateSkillDto } from '../dto/create-skill.dto';
import { UpdateSkillDto } from '../dto/update-skill.dto';
import { RejectSkillDto } from '../dto/reject-skill.dto';
import { SkillStatus } from '../../../common/enums/skill-status.enum';

@Injectable()
export class SkillService {
  constructor(
    @InjectRepository(Skill)
    private readonly skillRepo: Repository<Skill>,
    @InjectRepository(SkillCategory)
    private readonly categoryRepo: Repository<SkillCategory>,
  ) {}

  async create(dto: CreateSkillDto): Promise<Skill> {
    await this.assertUnique(dto.name, dto.slug);

    let category: SkillCategory | undefined;
    if (dto.categoryId) {
      const foundCategory = await this.categoryRepo.findOne({ where: { id: dto.categoryId } });
      category = foundCategory ?? undefined;
      if (!category) {
        throw new BadRequestException(`Skill category with id "${dto.categoryId}" not found`);
      }
    }

    const skill = this.skillRepo.create({
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      category,
    });
    return this.skillRepo.save(skill);
  }

  findAll(categoryId?: string, includeAllStatuses: boolean = false): Promise<Skill[]> {
    const query = this.skillRepo
      .createQueryBuilder('skill')
      .leftJoinAndSelect('skill.category', 'category')
      .orderBy('skill.name', 'ASC');

    // By default, only return approved skills for public access
    if (!includeAllStatuses) {
      query.andWhere('skill.status = :status', { status: SkillStatus.APPROVED });
    }

    if (categoryId) {
      query.andWhere('category.id = :categoryId', { categoryId });
    }

    return query.getMany();
  }

  async findOne(id: string): Promise<Skill> {
    const skill = await this.skillRepo.findOne({
      where: { id },
      relations: ['category'],
    });
    if (!skill) {
      throw new NotFoundException(`Skill with id "${id}" not found`);
    }
    return skill;
  }

  async update(id: string, dto: UpdateSkillDto): Promise<Skill> {
    const skill = await this.findOne(id);

    if (dto.name !== undefined || dto.slug !== undefined) {
      await this.assertUnique(dto.name ?? skill.name, dto.slug ?? skill.slug, id);
    }

    if (dto.categoryId !== undefined) {
      if (dto.categoryId === null) {
        skill.category = undefined;
      } else {
        const category = await this.categoryRepo.findOne({ where: { id: dto.categoryId } });
        if (!category) {
          throw new BadRequestException(`Skill category with id "${dto.categoryId}" not found`);
        }
        skill.category = category;
      }
    }

    const { categoryId: _, ...rest } = dto;
    Object.assign(skill, rest);
    return this.skillRepo.save(skill);
  }

  async remove(id: string): Promise<void> {
    const skill = await this.findOne(id);
    await this.skillRepo.remove(skill);
  }

  // ---------------------------------------------------------------------------
  // Moderation methods
  // ---------------------------------------------------------------------------

  /**
   * Find all pending skills awaiting moderation
   */
  async findPending(): Promise<Skill[]> {
    return this.skillRepo.find({
      where: { status: SkillStatus.PENDING },
      relations: ['category'],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Approve a skill (admin only)
   */
  async approve(id: string, adminId: string): Promise<Skill> {
    const skill = await this.findOne(id);

    if (skill.status === SkillStatus.APPROVED) {
      throw new BadRequestException('Skill is already approved');
    }

    skill.status = SkillStatus.APPROVED;
    skill.moderatedBy = adminId;
    skill.moderatedAt = new Date();
    skill.rejectionReason = undefined;

    return this.skillRepo.save(skill);
  }

  /**
   * Reject a skill (admin only)
   */
  async reject(id: string, adminId: string, dto: RejectSkillDto): Promise<Skill> {
    const skill = await this.findOne(id);

    if (skill.status === SkillStatus.REJECTED) {
      throw new BadRequestException('Skill is already rejected');
    }

    skill.status = SkillStatus.REJECTED;
    skill.rejectionReason = dto.reason;
    skill.moderatedBy = adminId;
    skill.moderatedAt = new Date();

    return this.skillRepo.save(skill);
  }

  /**
   * Find one skill by ID (with status check for public access)
   */
  async findOnePublic(id: string): Promise<Skill> {
    const skill = await this.findOne(id);

    if (skill.status !== SkillStatus.APPROVED) {
      throw new NotFoundException(`Skill with id "${id}" not found`);
    }

    return skill;
  }

  /**
   * Check if skills exist and are approved
   */
  async validateSkillsForAttachment(skillIds: string[]): Promise<Skill[]> {
    const skills = await this.skillRepo.find({
      where: { id: In(skillIds) },
    });

    if (skills.length !== skillIds.length) {
      const foundIds = skills.map(s => s.id);
      const missingIds = skillIds.filter(id => !foundIds.includes(id));
      throw new BadRequestException(`Skills not found: ${missingIds.join(', ')}`);
    }

    const nonApprovedSkills = skills.filter(s => s.status !== SkillStatus.APPROVED);
    if (nonApprovedSkills.length > 0) {
      const nonApprovedNames = nonApprovedSkills.map(s => s.name).join(', ');
      throw new BadRequestException(
        `Cannot attach non-approved skills: ${nonApprovedNames}. Skills must be approved before use.`,
      );
    }

    return skills;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async assertUnique(name: string, slug: string, excludeId?: string): Promise<void> {
    const byName = await this.skillRepo.findOne({
      where: { name, ...(excludeId ? { id: Not(excludeId) } : {}) },
    });
    if (byName) {
      throw new ConflictException(`A skill with name "${name}" already exists`);
    }

    const bySlug = await this.skillRepo.findOne({
      where: { slug, ...(excludeId ? { id: Not(excludeId) } : {}) },
    });
    if (bySlug) {
      throw new ConflictException(`A skill with slug "${slug}" already exists`);
    }
  }
}
