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
import { SkillSuggestionDto, DuplicateSkillResponseDto } from '../dto/duplicate-skill-response.dto';
import { SkillStatus } from '../../../common/enums/skill-status.enum';
import { normalizeSkillName } from '../entities/skill.entity';

// Similarity threshold for near-duplicate detection (0-1)
const SIMILARITY_THRESHOLD = 0.7;

@Injectable()
export class SkillService {
  constructor(
    @InjectRepository(Skill)
    private readonly skillRepo: Repository<Skill>,
    @InjectRepository(SkillCategory)
    private readonly categoryRepo: Repository<SkillCategory>,
  ) {}

  async create(dto: CreateSkillDto): Promise<Skill> {
    const normalizedName = normalizeSkillName(dto.name);

    // 1. Check for duplicate name (case/space variations handled by normalizedName)
    const existingName = await this.skillRepo.findOne({
      where: { normalizedName },
    });
    if (existingName) {
      throw this.createDuplicateError(
        `A skill with name "${dto.name}" already exists`,
        'normalized',
        [existingName],
      );
    }

    // 2. Generate unique slug if not provided, or ensure provided one is unique
    let slug = dto.slug;
    if (!slug) {
      slug = await this.generateUniqueSlug(dto.name);
    } else {
      // If slug provided manually, still ensure it's unique with suffixing if needed
      slug = await this.ensureUniqueSlug(slug);
    }

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
      normalizedName,
      slug,
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

    // If name is changed, normalizedName will be updated via @BeforeUpdate in entity,
    // but slug remains immutable per requirements.
    if (dto.name !== undefined && dto.name !== skill.name) {
      const normalizedName = normalizeSkillName(dto.name);
      const existingName = await this.skillRepo.findOne({
        where: { id: Not(id), normalizedName },
      });
      if (existingName) {
        throw this.createDuplicateError(
          `Cannot rename to "${dto.name}": similarity with "${existingName.name}"`,
          'normalized',
          [existingName],
        );
      }
    }

    // Slug is immutable on update/rename as per requirements.
    // If user explicitly tries to change slug, we can either ignore it or throw.
    // Given the task says "keep immutable on rename", we'll ignore slug changes in update.
    const { categoryId: _, slug: _slug, ...rest } = dto;

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

  /**
   * Check for duplicate skills and throw detailed error with suggestions
   */
  private async checkForDuplicates(
    name: string,
    slug: string,
    excludeId?: string,
  ): Promise<void> {
    const normalizedName = normalizeSkillName(name);

    // 1. Check for exact name match
    const exactNameMatch = await this.skillRepo.findOne({
      where: { name, ...(excludeId ? { id: Not(excludeId) } : {}) },
    });
    if (exactNameMatch) {
      throw this.createDuplicateError(
        `A skill with name "${name}" already exists`,
        'exact',
        [exactNameMatch],
      );
    }

    // 2. Check for normalized name match (case/space variations)
    const normalizedMatch = await this.skillRepo
      .createQueryBuilder('skill')
      .where('skill.normalizedName = :normalizedName', { normalizedName })
      .andWhere(excludeId ? 'skill.id != :excludeId' : '1=1', { excludeId })
      .getOne();

    if (normalizedMatch) {
      throw this.createDuplicateError(
        `A skill with a similar name "${normalizedMatch.name}" already exists (normalized: "${normalizedName}")`,
        'normalized',
        [normalizedMatch],
      );
    }

    // 3. Check for slug match (case-insensitive)
    const slugMatch = await this.skillRepo
      .createQueryBuilder('skill')
      .where('LOWER(skill.slug) = LOWER(:slug)', { slug })
      .andWhere(excludeId ? 'skill.id != :excludeId' : '1=1', { excludeId })
      .getOne();

    if (slugMatch) {
      throw this.createDuplicateError(
        `A skill with slug "${slug}" already exists`,
        'exact',
        [slugMatch],
      );
    }

    // 4. Check for near-duplicates using trigram similarity
    const similarSkills = await this.findSimilarSkills(name, excludeId);
    if (similarSkills.length > 0) {
      throw this.createDuplicateError(
        `Similar skill(s) already exist. Did you mean: ${similarSkills.map(s => s.name).join(', ')}?`,
        'similar',
        similarSkills,
      );
    }
  }

  /**
   * Find skills with similar names using trigram similarity
   */
  private async findSimilarSkills(
    name: string,
    excludeId?: string,
  ): Promise<Skill[]> {
    try {
      const results = await this.skillRepo
        .createQueryBuilder('skill')
        .select([
          'skill.id as id',
          'skill.name as name',
          'skill.slug as slug',
          'similarity(skill.name, :name) as similarity',
        ])
        .where('similarity(skill.name, :name) > :threshold', {
          name,
          threshold: SIMILARITY_THRESHOLD,
        })
        .andWhere(excludeId ? 'skill.id != :excludeId' : '1=1', { excludeId })
        .orderBy('similarity', 'DESC')
        .limit(5)
        .getRawMany();

      // Filter out exact matches (already handled above)
      const normalizedName = normalizeSkillName(name);
      return results
        .filter((r: any) => normalizeSkillName(r.name) !== normalizedName)
        .map((r: any) => {
          const skill = new Skill();
          skill.id = r.id;
          skill.name = r.name;
          skill.slug = r.slug;
          return skill;
        });
    } catch {
      // If similarity function doesn't exist (pg_trgm not installed), skip this check
      return [];
    }
  }

  /**
   * Create a detailed ConflictException with suggestions
   */
  private createDuplicateError(
    message: string,
    duplicateType: 'exact' | 'normalized' | 'similar',
    skills: Skill[],
  ): ConflictException {
    const suggestions: SkillSuggestionDto[] = skills.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
    }));

    const response: DuplicateSkillResponseDto = {
      message,
      duplicateType,
      suggestions,
    };

    return new ConflictException(response);
  }

  /**
   * Generates a unique, URL-safe slug from a skill name
   */
  private async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Keep alphanumeric, spaces, and hyphens (ASCII-safe)
      .replace(/\s+/g, '-')     // Spaces to hyphens
      .replace(/-+/g, '-');     // Collapse hyphens

    return this.ensureUniqueSlug(baseSlug);
  }

  /**
   * Checks if a slug is taken and appends a numeric suffix if needed
   */
  private async ensureUniqueSlug(baseSlug: string): Promise<string> {
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      // Case-insensitive check for slug uniqueness
      const existing = await this.skillRepo
        .createQueryBuilder('skill')
        .where('LOWER(skill.slug) = :slug', { slug: slug.toLowerCase() })
        .getOne();

      if (!existing) break;

      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    return slug;
  }

  /**
   * @deprecated Use check for duplicates logic directly in create/update
   */
  private async assertUnique(name: string, slug: string, excludeId?: string): Promise<void> {
    await this.checkForDuplicates(name, slug, excludeId);
  }
}
