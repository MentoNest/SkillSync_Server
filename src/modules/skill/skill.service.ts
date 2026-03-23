import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Skill } from './entities/skill.entity';
import { Tag } from '../tag/entities/tag.entity';
import { SkillPopularityService } from '../skills/providers/skill-popularity.service';

export interface RecommendedSkill {
  id: number;
  name: string;
  slug: string;
  description?: string;
  tags: string[];
  sameCategory: boolean;
  tagOverlapCount: number;
  popularityScore: number;
  recommendationScore: number;
}

@Injectable()
export class SkillService {
  constructor(
    @InjectRepository(Skill)
    private skillRepo: Repository<Skill>,
    @InjectRepository(Tag)
    private tagRepo: Repository<Tag>,
    private readonly popularityService: SkillPopularityService,
  ) {}

  async search(query: string, page = 1, limit = 10, tags?: string[]) {
    const offset = (page - 1) * limit;
    const qb = this.skillRepo.createQueryBuilder('skill')
      .leftJoinAndSelect('skill.tags', 'tag')
      .addSelect(`ts_rank(skill.searchVector, plainto_tsquery('english', :q))`, 'rank')
      .where(`skill.searchVector @@ plainto_tsquery('english', :q)`, { q: query });
    if (tags && tags.length > 0) {
      tags.forEach((slug, i) => {
        qb.andWhere(`EXISTS (SELECT 1 FROM skill_tags st JOIN tags t ON st.tag_id = t.id WHERE st.skill_id = skill.id AND t.slug = :slug${i})`, { [`slug${i}`]: slug });
      });
    }
    qb.orderBy('rank', 'DESC')
      .addOrderBy('skill.name', 'ASC')
      .offset(offset)
      .limit(limit);
    const [results, total] = await qb.getManyAndCount();
    return {
      results,
      total,
      page,
      pageCount: Math.ceil(total / limit),
    };
  }

  /**
   * Get a skill by ID
   */
  async findById(id: number): Promise<Skill> {
    const skill = await this.skillRepo.findOne({
      where: { id },
      relations: ['tags'],
    });
    if (!skill) {
      throw new NotFoundException(`Skill with id "${id}" not found`);
    }
    return skill;
  }

  /**
   * Get a skill by slug
   */
  async findBySlug(slug: string): Promise<Skill> {
    const skill = await this.skillRepo.findOne({
      where: { slug },
      relations: ['tags'],
    });
    if (!skill) {
      throw new NotFoundException(`Skill with slug "${slug}" not found`);
    }
    return skill;
  }

  /**
   * Get recommended skills based on content similarity and popularity
   * Ranking: category overlap > tag overlap > popularity
   * Uses slug-based lookup for the endpoint
   */
  async getRecommendedSkills(skillSlug: string, limit: number = 10): Promise<RecommendedSkill[]> {
    const currentSkill = await this.findBySlug(skillSlug);
    
    const currentTagIds = currentSkill.tags?.map(t => t.id) || [];
    const currentCategoryId = currentSkill.categoryId;

    // Find all other skills (we'll filter and score them)
    const allSkills = await this.skillRepo
      .createQueryBuilder('skill')
      .leftJoinAndSelect('skill.tags', 'tag')
      .where('skill.id != :currentId', { currentId: currentSkill.id })
      .getMany();

    if (allSkills.length === 0) {
      return [];
    }

    // Calculate scores for each skill
    const skillScores: RecommendedSkill[] = [];

    for (const skill of allSkills) {
      const skillTags = skill.tags || [];
      const overlappingTags = skillTags.filter(t => currentTagIds.includes(t.id));
      const tagOverlapCount = overlappingTags.length;
      const sameCategory = !!(currentCategoryId && skill.categoryId === currentCategoryId);

      // Get popularity score for this skill
      let popularityScore = 0;
      try {
        const popularityData = await this.popularityService.calculatePopularityScore(
          skill.id,
          30,
          0.9,
        );
        popularityScore = popularityData.weightedScore;
      } catch {
        popularityScore = 0;
      }

      // Calculate recommendation score with priority:
      // 1. Same category (highest priority - weighted heavily)
      // 2. Tag overlap count
      // 3. Popularity score (tiebreaker)
      // Category match is worth more than any tag overlap to ensure priority
      const categoryScore = sameCategory ? 10000 : 0;
      const tagScore = tagOverlapCount * 100;
      const recommendationScore = categoryScore + tagScore + popularityScore;

      skillScores.push({
        id: skill.id,
        name: skill.name,
        slug: skill.slug,
        description: skill.description,
        tags: skillTags.map(t => t.name),
        sameCategory,
        tagOverlapCount,
        popularityScore,
        recommendationScore,
      });
    }

    // Sort by recommendation score (desc), then by name (asc) for deterministic ordering
    skillScores.sort((a, b) => {
      if (b.recommendationScore !== a.recommendationScore) {
        return b.recommendationScore - a.recommendationScore;
      }
      return a.name.localeCompare(b.name);
    });

    // Return top N skills
    return skillScores.slice(0, limit);
  }
}
