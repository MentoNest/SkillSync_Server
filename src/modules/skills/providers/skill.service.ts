import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Skill } from '../entities/skill.entity';
import { SkillCategory } from '../entities/skill-category.entity';
import { CreateSkillDto } from '../dto/create-skill.dto';
import { UpdateSkillDto } from '../dto/update-skill.dto';

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

  findAll(categoryId?: string): Promise<Skill[]> {
    const query = this.skillRepo
      .createQueryBuilder('skill')
      .leftJoinAndSelect('skill.category', 'category')
      .orderBy('skill.name', 'ASC');

    if (categoryId) {
      query.where('category.id = :categoryId', { categoryId });
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
