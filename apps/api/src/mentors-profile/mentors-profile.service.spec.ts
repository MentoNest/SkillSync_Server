import { Test, TestingModule } from '@nestjs/testing';
import { MentorsController } from './mentors-profile.controller';
import { MentorsService } from './mentors-profile.service';
import { MentorProfileStatus } from './entities/mentors-profile.entity';

describe('MentorsController', () => {
  let controller: MentorsController;
  let service: MentorsService;

  const mockMentorsService = {
    createProfile: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    getProfileByUserId: jest.fn(),
    updateProfile: jest.fn(),
    updateProfileById: jest.fn(),
    remove: jest.fn(),
    submitProfile: jest.fn(),
  };

  const mockMentorProfile = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    userId: '123e4567-e89b-12d3-a456-426614174001',
    headline: 'Senior Full-Stack Developer',
    rateMinor: 1000000, // 10,000 NGN in kobo
    yearsExp: 5,
    status: MentorProfileStatus.DRAFT,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MentorsController],
      providers: [
        {
          provide: MentorsService,
          useValue: mockMentorsService,
        },
      ],
    }).compile();

    controller = module.get<MentorsController>(MentorsController);
    service = module.get<MentorsService>(MentorsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createProfile', () => {
    it('should create a mentor profile', async () => {
      const createDto = {
        headline: 'Senior Full-Stack Developer',
        rateMinor: 1000000,
        yearsExp: 5,
      };

      const req = { user: { id: '123e4567-e89b-12d3-a456-426614174001' } };

      mockMentorsService.createProfile.mockResolvedValue(mockMentorProfile);

      const result = await controller.createProfile(req, createDto);

      expect(result).toEqual(mockMentorProfile);
      expect(mockMentorsService.createProfile).toHaveBeenCalledWith(
        req.user.id,
        createDto,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated mentors with filters', async () => {
      const queryDto = {
        expertise: 'JavaScript',
        minPrice: 5000,
        maxPrice: 15000,
        page: 1,
        limit: 10,
      };

      const paginatedResult = {
        data: [mockMentorProfile],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      mockMentorsService.findAll.mockResolvedValue(paginatedResult);

      const result = await controller.findAll(queryDto);

      expect(result).toEqual(paginatedResult);
      expect(mockMentorsService.findAll).toHaveBeenCalledWith(queryDto);
    });

    it('should return all mentors without filters', async () => {
      const queryDto = { page: 1, limit: 10 };

      const paginatedResult = {
        data: [mockMentorProfile],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      mockMentorsService.findAll.mockResolvedValue(paginatedResult);

      const result = await controller.findAll(queryDto);

      expect(result).toEqual(paginatedResult);
    });
  });

  describe('findOne', () => {
    it('should return a single mentor by id', async () => {
      mockMentorsService.findOne.mockResolvedValue(mockMentorProfile);

      const result = await controller.findOne(mockMentorProfile.id);

      expect(result).toEqual(mockMentorProfile);
      expect(mockMentorsService.findOne).toHaveBeenCalledWith(
        mockMentorProfile.id,
      );
    });
  });

  describe('updateProfileById', () => {
    it('should update a mentor profile', async () => {
      const updateDto = { rateMinor: 1200000 };
      const req = { user: { id: mockMentorProfile.userId } };
      const updatedMentor = { ...mockMentorProfile, rateMinor: 1200000 };

      mockMentorsService.updateProfileById.mockResolvedValue(updatedMentor);

      const result = await controller.updateProfileById(
        mockMentorProfile.id,
        req,
        updateDto,
      );

      expect(result).toEqual(updatedMentor);
      expect(mockMentorsService.updateProfileById).toHaveBeenCalledWith(
        mockMentorProfile.id,
        req.user.id,
        updateDto,
      );
    });
  });

  describe('remove', () => {
    it('should soft delete a mentor profile', async () => {
      const req = { user: { id: mockMentorProfile.userId } };

      mockMentorsService.remove.mockResolvedValue(undefined);

      await controller.remove(mockMentorProfile.id, req);

      expect(mockMentorsService.remove).toHaveBeenCalledWith(
        mockMentorProfile.id,
        req.user.id,
      );
    });
  });

  describe('submitProfile', () => {
    it('should submit a profile for review', async () => {
      const req = { user: { id: mockMentorProfile.userId } };
      const submittedProfile = {
        ...mockMentorProfile,
        status: MentorProfileStatus.SUBMITTED,
      };

      mockMentorsService.submitProfile.mockResolvedValue(submittedProfile);

      const result = await controller.submitProfile(req);

      expect(result).toEqual(submittedProfile);
      expect(mockMentorsService.submitProfile).toHaveBeenCalledWith(
        req.user.id,
      );
    });
  });
});