import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Cache } from 'cache-manager';

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

export interface TrendingSkill {
  skillId: number;
  name: string;
  slug: string;
  score: number;
  rank: number;
}

@Injectable()
export class SkillService {
  constructor(
    @InjectRepository(Skill)
    private skillRepo: Repository<Skill>,

    @InjectRepository(Tag)
    private tagRepo: Repository<Tag>,

    private readonly popularityService: SkillPopularityService,

    @Inject('CACHE_MANAGER')
    private cacheManager: Cache,
  ) {}

  // -------------------------------------
  // SEARCH
  // -------------------------------------
  async search(query: string, page = 1, limit = 10, tags?: string[]) {
    const offset = (page - 1) * limit;

    const qb = this.skillRepo.createQueryBuilder('skill')
      .leftJoinAndSelect('skill.tags', 'tag')
      .addSelect(`ts_rank(skill.searchVector, plainto_tsquery('english', :q))`, 'rank')
      .where(`skill.searchVector @@ plainto_tsquery('english', :q)`, { q: query });

    if (tags && tags.length > 0) {
      tags.forEach((slug, i) => {
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM skill_tags st 
            JOIN tags t ON st.tag_id = t.id 
            WHERE st.skill_id = skill.id 
            AND t.slug = :slug${i}
          )`,
          { [`slug${i}`]: slug },
        );
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

  // -------------------------------------
  // FINDERS
  // -------------------------------------
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

  // -------------------------------------
  // TRENDING SKILLS (🔥 NEW)
  // -------------------------------------
  private resolveWindowToDays(window: string): number {
    switch (window) {
      case '24h':
        return 1;
      case '30d':
        return 30;
      case '7d':
      default:
        return 7;
    }
  }

  async getTrendingSkills(
    window: '24h' | '7d' | '30d' = '7d',
    limit: number = 20,
  ): Promise<TrendingSkill[]> {

    const cacheKey = `trending:skills:${window}:${limit}`;

    // ✅ 1. Check cache
    const cached = await this.cacheManager.get<TrendingSkill[]>(cacheKey);
    if (cached) return cached;

    const days = this.resolveWindowToDays(window);

    // ✅ 2. Fetch all skills (lightweight)
    const skills = await this.skillRepo.find({
      select: ['id', 'name', 'slug'],
    });

    if (!skills.length) {
      return [];
    }

    // ✅ 3. Compute popularity in parallel (IMPORTANT)
    const scored = await Promise.all(
      skills.map(async (skill) => {
        let score = 0;

        try {
          const result = await this.popularityService.calculatePopularityScore(
            skill.id,
            days,
            0.9,
          );

          score = result?.weightedScore || 0;
        } catch {
          score = 0;
        }

        return {
          skillId: skill.id,
          name: skill.name,
          slug: skill.slug,
          score,
        };
      }),
    );

    // ✅ 4. Sort + rank
    const ranked = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));

    // ✅ 5. Cache (10 mins)
    await this.cacheManager.set(cacheKey, ranked, 600);

    return ranked;
  }

  // -------------------------------------
  // RECOMMENDATIONS (UNCHANGED BUT OPTIMIZED)
  // -------------------------------------
  async getRecommendedSkills(
    skillSlug: string,
    limit: number = 10,
  ): Promise<RecommendedSkill[]> {

    const currentSkill = await this.findBySlug(skillSlug);

    const currentTagIds = currentSkill.tags?.map(t => t.id) || [];
    const currentCategoryId = currentSkill.categoryId;

    const allSkills = await this.skillRepo
      .createQueryBuilder('skill')
      .leftJoinAndSelect('skill.tags', 'tag')
      .where('skill.id != :currentId', { currentId: currentSkill.id })
      .getMany();

    if (!allSkills.length) return [];

    // ⚡ PERFORMANCE BOOST: parallel scoring
    const skillScores: RecommendedSkill[] = await Promise.all(
      allSkills.map(async (skill) => {
        const skillTags = skill.tags || [];
        const overlappingTags = skillTags.filter(t =>
          currentTagIds.includes(t.id),
        );

        const tagOverlapCount = overlappingTags.length;
        const sameCategory = !!(
          currentCategoryId &&
          skill.categoryId === currentCategoryId
        );

        let popularityScore = 0;

        try {
          const popularityData =
            await this.popularityService.calculatePopularityScore(
              skill.id,
              30,
              0.9,
            );

          popularityScore = popularityData.weightedScore;
        } catch {
          popularityScore = 0;
        }

        const categoryScore = sameCategory ? 10000 : 0;
        const tagScore = tagOverlapCount * 100;

        const recommendationScore =
          categoryScore + tagScore + popularityScore;

        return {
          id: skill.id,
          name: skill.name,
          slug: skill.slug,
          description: skill.description,
          tags: skillTags.map(t => t.name),
          sameCategory,
          tagOverlapCount,
          popularityScore,
          recommendationScore,
        };
      }),
    );

    return skillScores
      .sort((a, b) => {
        if (b.recommendationScore !== a.recommendationScore) {
          return b.recommendationScore - a.recommendationScore;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, limit);
  }
}