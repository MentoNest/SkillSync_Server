import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { SkillCategory } from '../entities/skill-category.entity';
import { CreateSkillCategoryDto } from '../dto/create-skill-category.dto';
import { UpdateSkillCategoryDto } from '../dto/update-skill-category.dto';

@Injectable()
export class SkillCategoryService {
  constructor(
    @InjectRepository(SkillCategory)
    private readonly categoryRepo: Repository<SkillCategory>,
  ) {}

  async create(dto: CreateSkillCategoryDto): Promise<SkillCategory> {
    await this.assertUnique(dto.name, dto.slug);
    const category = this.categoryRepo.create(dto);
    return this.categoryRepo.save(category);
  }

  findAll(): Promise<SkillCategory[]> {
    return this.categoryRepo.find({
      relations: ['skills'],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<SkillCategory> {
    const category = await this.categoryRepo.findOne({
      where: { id },
      relations: ['skills'],
    });
    if (!category) {
      throw new NotFoundException(`Skill category with id "${id}" not found`);
    }
    return category;
  }

  async update(id: string, dto: UpdateSkillCategoryDto): Promise<SkillCategory> {
    const category = await this.findOne(id);
    if (dto.name !== undefined || dto.slug !== undefined) {
      await this.assertUnique(
        dto.name ?? category.name,
        dto.slug ?? category.slug,
        id,
      );
    }
    Object.assign(category, dto);
    return this.categoryRepo.save(category);
  }

  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);
    await this.categoryRepo.remove(category);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async assertUnique(name: string, slug: string, excludeId?: string): Promise<void> {
    const byName = await this.categoryRepo.findOne({
      where: { name, ...(excludeId ? { id: Not(excludeId) } : {}) },
    });
    if (byName) {
      throw new ConflictException(`A category with name "${name}" already exists`);
    }

    const bySlug = await this.categoryRepo.findOne({
      where: { slug, ...(excludeId ? { id: Not(excludeId) } : {}) },
    });
    if (bySlug) {
      throw new ConflictException(`A category with slug "${slug}" already exists`);
    }
  }
}
