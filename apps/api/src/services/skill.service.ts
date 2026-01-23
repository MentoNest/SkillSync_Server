import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Skill } from '../entities/skill.entity';
import { CreateSkillDto } from '../dtos/skill.dto';

@Injectable()
export class SkillService {
  constructor(
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
  ) {}

  async create(createSkillDto: CreateSkillDto): Promise<Skill> {
    const slug = this.generateSlug(createSkillDto.name);

    const existingSkill = await this.skillRepository.findOne({
      where: [{ name: createSkillDto.name }, { slug }],
    });

    if (existingSkill) {
      throw new ConflictException('Skill with this name already exists');
    }

    const skill = this.skillRepository.create({
      ...createSkillDto,
      slug,
    });

    return await this.skillRepository.save(skill);
  }

  async findAll(): Promise<Skill[]> {
    return await this.skillRepository.find();
  }

  async findOne(id: string): Promise<Skill> {
    const skill = await this.skillRepository.findOne({ where: { id } });

    if (!skill) {
      throw new NotFoundException(`Skill with ID ${id} not found`);
    }

    return skill;
  }

  async findBySlug(slug: string): Promise<Skill> {
    const skill = await this.skillRepository.findOne({ where: { slug } });

    if (!skill) {
      throw new NotFoundException(`Skill with slug ${slug} not found`);
    }

    return skill;
  }

  async delete(id: string): Promise<void> {
    const result = await this.skillRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Skill with ID ${id} not found`);
    }
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
