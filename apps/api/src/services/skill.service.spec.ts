import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SkillService } from '../services/skill.service';
import { Skill } from '../users/entities/skill.entity';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('SkillService', () => {
  let service: SkillService;

  const mockSkillRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
  };

  const mockSkill: Skill = {
    id: '1',
    name: 'NestJS',
    slug: 'nestjs',
    category: 'backend',
    mentorSkills: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillService,
        {
          provide: getRepositoryToken(Skill),
          useValue: mockSkillRepository,
        },
      ],
    }).compile();

    service = module.get<SkillService>(SkillService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new skill', async () => {
      const createSkillDto = { name: 'NestJS', category: 'backend' };

      mockSkillRepository.findOne.mockResolvedValue(null);
      mockSkillRepository.create.mockReturnValue(mockSkill);
      mockSkillRepository.save.mockResolvedValue(mockSkill);

      const result = await service.create(createSkillDto);

      expect(result).toEqual(mockSkill);
      expect(mockSkillRepository.findOne).toHaveBeenCalled();
      expect(mockSkillRepository.create).toHaveBeenCalled();
      expect(mockSkillRepository.save).toHaveBeenCalledWith(mockSkill);
    });

    it('should throw ConflictException if skill already exists', async () => {
      const createSkillDto = { name: 'NestJS', category: 'backend' };

      mockSkillRepository.findOne.mockResolvedValue(mockSkill);

      await expect(service.create(createSkillDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('should return an array of skills', async () => {
      const skills = [mockSkill];
      mockSkillRepository.find.mockResolvedValue(skills);

      const result = await service.findAll();

      expect(result).toEqual(skills);
      expect(mockSkillRepository.find).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a skill by id', async () => {
      mockSkillRepository.findOne.mockResolvedValue(mockSkill);

      const result = await service.findOne('1');

      expect(result).toEqual(mockSkill);
      expect(mockSkillRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('should throw NotFoundException if skill not found', async () => {
      mockSkillRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findBySlug', () => {
    it('should return a skill by slug', async () => {
      mockSkillRepository.findOne.mockResolvedValue(mockSkill);

      const result = await service.findBySlug('nestjs');

      expect(result).toEqual(mockSkill);
      expect(mockSkillRepository.findOne).toHaveBeenCalledWith({
        where: { slug: 'nestjs' },
      });
    });

    it('should throw NotFoundException if skill not found', async () => {
      mockSkillRepository.findOne.mockResolvedValue(null);

      await expect(service.findBySlug('nestjs')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('should delete a skill', async () => {
      mockSkillRepository.delete.mockResolvedValue({ affected: 1 });

      await service.delete('1');

      expect(mockSkillRepository.delete).toHaveBeenCalledWith('1');
    });

    it('should throw NotFoundException if skill not found', async () => {
      mockSkillRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(service.delete('1')).rejects.toThrow(NotFoundException);
    });
  });
});
