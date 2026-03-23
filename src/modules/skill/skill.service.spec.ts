import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SkillService, RecommendedSkill } from './skill.service';
import { Skill } from './entities/skill.entity';
import { Tag } from '../tag/entities/tag.entity';
import { SkillPopularityService } from '../skills/providers/skill-popularity.service';
import { NotFoundException } from '@nestjs/common';

const createMockPopularityScore = (skillId: number, weightedScore: number) => ({
  skillId,
  totalEvents: 100,
  weightedScore,
  eventBreakdown: {
    skill_page_view: 50,
    mentor_skill_attach: 20,
    search_click: 20,
    profile_view: 10,
  },
});

describe('SkillService', () => {
  let service: SkillService;
  let skillRepo: jest.Mocked<Repository<Skill>>;
  let popularityService: jest.Mocked<SkillPopularityService>;

  const mockTag1: Tag = { id: 1, name: 'JavaScript', slug: 'javascript' } as Tag;
  const mockTag2: Tag = { id: 2, name: 'Programming', slug: 'programming' } as Tag;
  const mockTag3: Tag = { id: 3, name: 'Python', slug: 'python' } as Tag;

  // Category IDs for testing category prioritization
  const CATEGORY_WEB = 1;
  const CATEGORY_DATA = 2;

  const mockSkill: Skill = {
    id: 1,
    name: 'TypeScript',
    slug: 'typescript',
    description: 'A typed superset of JavaScript',
    tags: [mockTag1, mockTag2],
    categoryId: CATEGORY_WEB,
  } as unknown as Skill;

  const mockSkill2: Skill = {
    id: 2,
    name: 'JavaScript',
    slug: 'javascript',
    description: 'The language of the web',
    tags: [mockTag1],
    categoryId: CATEGORY_WEB,
  } as unknown as Skill;

  const mockSkill3: Skill = {
    id: 3,
    name: 'Python',
    slug: 'python',
    description: 'A popular programming language',
    tags: [mockTag3, mockTag2],
    categoryId: CATEGORY_DATA,
  } as unknown as Skill;

  const mockSkill4: Skill = {
    id: 4,
    name: 'React',
    slug: 'react',
    description: 'A JavaScript library for building UIs',
    tags: [mockTag1],
    categoryId: CATEGORY_WEB,
  } as unknown as Skill;

  // Skill with no tags
  const mockSkillNoTags: Skill = {
    id: 5,
    name: 'NoTags Skill',
    slug: 'notags-skill',
    description: 'A skill without tags',
    tags: [],
    categoryId: CATEGORY_WEB,
  } as unknown as Skill;

  // Skill with no category
  const mockSkillNoCategory: Skill = {
    id: 6,
    name: 'Uncategorized Skill',
    slug: 'uncategorized-skill',
    description: 'A skill without category',
    tags: [mockTag1],
    categoryId: undefined,
  } as unknown as Skill;

  const createMockQueryBuilder = (skills: Skill[]) => ({
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockImplementation((fn: any) => {
      fn(createMockQueryBuilder(skills));
      return createMockQueryBuilder(skills);
    }),
    setParameter: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(skills),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillService,
        {
          provide: getRepositoryToken(Skill),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Tag),
          useValue: {},
        },
        {
          provide: SkillPopularityService,
          useValue: {
            calculatePopularityScore: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SkillService>(SkillService);
    skillRepo = module.get(getRepositoryToken(Skill));
    popularityService = module.get(SkillPopularityService);
  });

  describe('findById', () => {
    it('should return a skill when found', async () => {
      skillRepo.findOne!.mockResolvedValue(mockSkill);

      const result = await service.findById(1);

      expect(result).toEqual(mockSkill);
      expect(skillRepo.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['tags'],
      });
    });

    it('should throw NotFoundException when skill not found', async () => {
      skillRepo.findOne!.mockResolvedValue(null);

      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findBySlug', () => {
    it('should return a skill when found by slug', async () => {
      skillRepo.findOne!.mockResolvedValue(mockSkill);

      const result = await service.findBySlug('typescript');

      expect(result).toEqual(mockSkill);
      expect(skillRepo.findOne).toHaveBeenCalledWith({
        where: { slug: 'typescript' },
        relations: ['tags'],
      });
    });

    it('should throw NotFoundException when skill not found by slug', async () => {
      skillRepo.findOne!.mockResolvedValue(null);

      await expect(service.findBySlug('nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findBySlug('nonexistent')).rejects.toThrow('Skill with slug "nonexistent" not found');
    });
  });

  describe('getRecommendedSkills', () => {
    it('should return empty array when no other skills exist', async () => {
      skillRepo.findOne!.mockResolvedValue(mockSkill);
      (skillRepo.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder([]));

      const result = await service.getRecommendedSkills('typescript');

      expect(result).toEqual([]);
    });

    it('should prioritize same category over tag overlap', async () => {
      skillRepo.findOne!.mockResolvedValue(mockSkill);
      // mockSkill3 has 1 overlapping tag but different category
      // mockSkill2 has 1 overlapping tag AND same category
      (skillRepo.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder([mockSkill2, mockSkill3]));

      popularityService.calculatePopularityScore!
        .mockResolvedValueOnce(createMockPopularityScore(2, 0))  // mockSkill2 - same category
        .mockResolvedValueOnce(createMockPopularityScore(3, 100)); // mockSkill3 - different category but high popularity

      const result = await service.getRecommendedSkills('typescript');

      expect(result).toHaveLength(2);
      // mockSkill2 should be first because it's in the same category
      expect(result[0].name).toBe('JavaScript');
      expect(result[0].sameCategory).toBe(true);
      // mockSkill3 should be second even with higher popularity
      expect(result[1].name).toBe('Python');
      expect(result[1].sameCategory).toBe(false);
    });

    it('should prioritize tag overlap within same category', async () => {
      skillRepo.findOne!.mockResolvedValue(mockSkill);
      // mockSkill2: same category, 1 tag overlap
      // mockSkill4: same category, 1 tag overlap (same score, sorted by name)
      (skillRepo.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder([mockSkill2, mockSkill4]));

      popularityService.calculatePopularityScore!
        .mockResolvedValueOnce(createMockPopularityScore(2, 0))
        .mockResolvedValueOnce(createMockPopularityScore(4, 0));

      const result = await service.getRecommendedSkills('typescript');

      expect(result).toHaveLength(2);
      expect(result[0].sameCategory).toBe(true);
      expect(result[1].sameCategory).toBe(true);
      // Both have same tag overlap, sorted alphabetically
      expect(['JavaScript', 'React']).toContain(result[0].name);
      expect(['JavaScript', 'React']).toContain(result[1].name);
    });

    it('should use popularity as tiebreaker when category and tags are equal', async () => {
      skillRepo.findOne!.mockResolvedValue(mockSkill);

      const skillA = { ...mockSkill2, name: 'AAA Skill', slug: 'aaa-skill', tags: [mockTag1], categoryId: CATEGORY_WEB } as Skill;
      const skillB = { ...mockSkill4, name: 'BBB Skill', slug: 'bbb-skill', tags: [mockTag1], categoryId: CATEGORY_WEB } as Skill;

      (skillRepo.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder([skillA, skillB]));

      popularityService.calculatePopularityScore!
        .mockResolvedValueOnce(createMockPopularityScore(100, 5))  // skillA lower popularity
        .mockResolvedValueOnce(createMockPopularityScore(101, 50)); // skillB higher popularity

      const result = await service.getRecommendedSkills('typescript');

      // Both have same category and tag overlap, so popularity decides
      expect(result[0].name).toBe('BBB Skill');
      expect(result[0].popularityScore).toBe(50);
    });

    it('should sort by name for deterministic ordering when all scores are equal', async () => {
      skillRepo.findOne!.mockResolvedValue(mockSkill);

      const skillA = { ...mockSkill2, name: 'AAA Skill', slug: 'aaa-skill', tags: [mockTag1], categoryId: CATEGORY_WEB } as Skill;
      const skillB = { ...mockSkill4, name: 'BBB Skill', slug: 'bbb-skill', tags: [mockTag1], categoryId: CATEGORY_WEB } as Skill;

      (skillRepo.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder([skillA, skillB]));

      popularityService.calculatePopularityScore!
        .mockResolvedValueOnce(createMockPopularityScore(100, 5))
        .mockResolvedValueOnce(createMockPopularityScore(101, 5));

      const result = await service.getRecommendedSkills('typescript');

      expect(result[0].name).toBe('AAA Skill');
      expect(result[1].name).toBe('BBB Skill');
    });

    it('should respect limit parameter', async () => {
      skillRepo.findOne!.mockResolvedValue(mockSkill);

      const manySkills = Array.from({ length: 20 }, (_, i) => ({
        id: i + 100,
        name: `Skill ${i}`,
        slug: `skill-${i}`,
        tags: [mockTag1],
        categoryId: CATEGORY_WEB,
      })) as Skill[];

      (skillRepo.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder(manySkills));
      popularityService.calculatePopularityScore!.mockResolvedValue(createMockPopularityScore(1, 1));

      const result = await service.getRecommendedSkills('typescript', 5);

      expect(result).toHaveLength(5);
    });

    it('should exclude current skill from results', async () => {
      skillRepo.findOne!.mockResolvedValue(mockSkill);
      (skillRepo.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder([mockSkill2]));
      popularityService.calculatePopularityScore!.mockResolvedValue(createMockPopularityScore(2, 5));

      const result = await service.getRecommendedSkills('typescript');

      expect(result.find(s => s.id === 1)).toBeUndefined();
    });

    it('should work with skills that have no tags', async () => {
      skillRepo.findOne!.mockResolvedValue(mockSkillNoTags);
      (skillRepo.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder([mockSkill, mockSkill2]));
      popularityService.calculatePopularityScore!.mockResolvedValue(createMockPopularityScore(1, 5));

      const result = await service.getRecommendedSkills('notags-skill');

      // Should return skills, just with 0 tag overlap
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].tagOverlapCount).toBe(0);
    });

    it('should handle skills without category', async () => {
      skillRepo.findOne!.mockResolvedValue(mockSkillNoCategory);
      (skillRepo.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder([mockSkill, mockSkill2]));
      popularityService.calculatePopularityScore!.mockResolvedValue(createMockPopularityScore(1, 5));

      const result = await service.getRecommendedSkills('uncategorized-skill');

      expect(result.length).toBeGreaterThan(0);
      // All results should have sameCategory = false since source has no category
      result.forEach(skill => {
        expect(skill.sameCategory).toBe(false);
      });
    });

    it('should return empty array when no other skills exist in database', async () => {
      skillRepo.findOne!.mockResolvedValue(mockSkill);
      (skillRepo.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder([]));

      const result = await service.getRecommendedSkills('typescript');

      expect(result).toEqual([]);
    });

    it('should handle popularity service errors gracefully', async () => {
      skillRepo.findOne!.mockResolvedValue(mockSkill);
      (skillRepo.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder([mockSkill2, mockSkill3]));

      popularityService.calculatePopularityScore!
        .mockRejectedValueOnce(new Error('Popularity service error'))
        .mockRejectedValueOnce(new Error('Popularity service error'));

      const result = await service.getRecommendedSkills('typescript');

      // Should still return results with popularityScore = 0
      expect(result).toHaveLength(2);
      expect(result[0].popularityScore).toBe(0);
      expect(result[1].popularityScore).toBe(0);
    });

    it('should include slug in recommended skill response', async () => {
      skillRepo.findOne!.mockResolvedValue(mockSkill);
      (skillRepo.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder([mockSkill2]));
      popularityService.calculatePopularityScore!.mockResolvedValue(createMockPopularityScore(2, 5));

      const result = await service.getRecommendedSkills('typescript');

      expect(result[0].slug).toBe('javascript');
    });

    it('should correctly calculate recommendation score with category priority', async () => {
      skillRepo.findOne!.mockResolvedValue(mockSkill);
      (skillRepo.createQueryBuilder as jest.Mock).mockReturnValue(createMockQueryBuilder([mockSkill2, mockSkill3]));

      popularityService.calculatePopularityScore!
        .mockResolvedValueOnce(createMockPopularityScore(2, 10))  // same category, 1 tag overlap
        .mockResolvedValueOnce(createMockPopularityScore(3, 5));  // different category, 1 tag overlap

      const result = await service.getRecommendedSkills('typescript');

      // mockSkill2: categoryScore=10000, tagScore=100, popularity=10 => 10110
      // mockSkill3: categoryScore=0, tagScore=100, popularity=5 => 105
      expect(result[0].recommendationScore).toBe(10110);
      expect(result[1].recommendationScore).toBe(105);
    });
  });
});
