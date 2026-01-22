import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MentorSkillService } from '../services/mentor-skill.service';
import { MentorSkill, SkillLevel } from '../entities/mentor-skill.entity';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { Skill } from '../entities/skill.entity';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('MentorSkillService', () => {
  let service: MentorSkillService;
  let mentorSkillRepository: Repository<MentorSkill>;
  let mentorProfileRepository: Repository<MentorProfile>;
  let skillRepository: Repository<Skill>;

  const mockMentorSkillRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockMentorProfileRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockSkillRepository = {
    findOne: jest.fn(),
  };

  const mockMentorProfile: Partial<MentorProfile> = {
    id: 'mentor-1',
    userId: 'user-1',
    bio: 'Test bio',
  };

  const mockSkill: Partial<Skill> = {
    id: 'skill-1',
    name: 'NestJS',
    slug: 'nestjs',
  };

  const mockMentorSkill: Partial<MentorSkill> = {
    id: 'ms-1',
    mentorProfileId: 'mentor-1',
    skillId: 'skill-1',
    level: SkillLevel.INTERMEDIATE,
    yearsExperience: 3,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MentorSkillService,
        {
          provide: getRepositoryToken(MentorSkill),
          useValue: mockMentorSkillRepository,
        },
        {
          provide: getRepositoryToken(MentorProfile),
          useValue: mockMentorProfileRepository,
        },
        {
          provide: getRepositoryToken(Skill),
          useValue: mockSkillRepository,
        },
      ],
    }).compile();

    service = module.get<MentorSkillService>(MentorSkillService);
    mentorSkillRepository = module.get<Repository<MentorSkill>>(
      getRepositoryToken(MentorSkill),
    );
    mentorProfileRepository = module.get<Repository<MentorProfile>>(
      getRepositoryToken(MentorProfile),
    );
    skillRepository = module.get<Repository<Skill>>(getRepositoryToken(Skill));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('attachSkill', () => {
    it('should attach a skill to a mentor profile', async () => {
      const attachSkillDto = {
        skillId: 'skill-1',
        level: SkillLevel.INTERMEDIATE,
        yearsExperience: 3,
      };

      mockMentorProfileRepository.findOne.mockResolvedValue(mockMentorProfile);
      mockSkillRepository.findOne.mockResolvedValue(mockSkill);
      mockMentorSkillRepository.findOne.mockResolvedValue(null);
      mockMentorSkillRepository.create.mockReturnValue(mockMentorSkill);
      mockMentorSkillRepository.save.mockResolvedValue(mockMentorSkill);

      const result = await service.attachSkill('user-1', attachSkillDto);

      expect(result).toEqual(mockMentorSkill);
      expect(mockMentorProfileRepository.findOne).toHaveBeenCalled();
      expect(mockSkillRepository.findOne).toHaveBeenCalled();
      expect(mockMentorSkillRepository.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if mentor profile not found', async () => {
      const attachSkillDto = {
        skillId: 'skill-1',
        level: SkillLevel.INTERMEDIATE,
        yearsExperience: 3,
      };

      mockMentorProfileRepository.findOne.mockResolvedValue(null);

      await expect(service.attachSkill('user-1', attachSkillDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if skill already attached', async () => {
      const attachSkillDto = {
        skillId: 'skill-1',
        level: SkillLevel.INTERMEDIATE,
        yearsExperience: 3,
      };

      mockMentorProfileRepository.findOne.mockResolvedValue(mockMentorProfile);
      mockSkillRepository.findOne.mockResolvedValue(mockSkill);
      mockMentorSkillRepository.findOne.mockResolvedValue(mockMentorSkill);

      await expect(service.attachSkill('user-1', attachSkillDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('updateSkill', () => {
    it('should update a mentor skill', async () => {
      const updateSkillDto = {
        level: SkillLevel.EXPERT,
        yearsExperience: 5,
      };

      mockMentorProfileRepository.findOne.mockResolvedValue(mockMentorProfile);
      mockMentorSkillRepository.findOne.mockResolvedValue(mockMentorSkill);
      mockMentorSkillRepository.save.mockResolvedValue({
        ...mockMentorSkill,
        ...updateSkillDto,
      });

      const result = await service.updateSkill('user-1', 'skill-1', updateSkillDto);

      expect(result.level).toBe(SkillLevel.EXPERT);
      expect(result.yearsExperience).toBe(5);
    });

    it('should throw NotFoundException if mentor skill not found', async () => {
      const updateSkillDto = {
        level: SkillLevel.EXPERT,
        yearsExperience: 5,
      };

      mockMentorProfileRepository.findOne.mockResolvedValue(mockMentorProfile);
      mockMentorSkillRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateSkill('user-1', 'skill-1', updateSkillDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('detachSkill', () => {
    it('should detach a skill from mentor profile', async () => {
      mockMentorProfileRepository.findOne.mockResolvedValue(mockMentorProfile);
      mockMentorSkillRepository.delete.mockResolvedValue({ affected: 1 });

      await service.detachSkill('user-1', 'skill-1');

      expect(mockMentorSkillRepository.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException if mentor skill not found', async () => {
      mockMentorProfileRepository.findOne.mockResolvedValue(mockMentorProfile);
      mockMentorSkillRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(service.detachSkill('user-1', 'skill-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getMentorSkills', () => {
    it('should return mentor skills', async () => {
      mockMentorProfileRepository.findOne.mockResolvedValue(mockMentorProfile);
      mockMentorSkillRepository.find.mockResolvedValue([mockMentorSkill]);

      const result = await service.getMentorSkills('user-1');

      expect(result).toEqual([mockMentorSkill]);
      expect(mockMentorSkillRepository.find).toHaveBeenCalled();
    });
  });
});
