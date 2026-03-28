import { generateSlug } from './entities/service-listing.entity';
import { ServiceListingService } from './service-listing.service';

describe('Slug Generation', () => {
  describe('generateSlug function', () => {
    it('should convert to lowercase and replace spaces with hyphens', () => {
      expect(generateSlug('Advanced TypeScript Course')).toBe('advanced-typescript-course');
    });

    it('should remove special characters', () => {
      expect(generateSlug('Advanced TypeScript & JavaScript!')).toBe('advanced-typescript-javascript');
    });

    it('should collapse multiple hyphens', () => {
      expect(generateSlug('Advanced   Typescript    Course')).toBe('advanced-typescript-course');
    });

    it('should trim whitespace', () => {
      expect(generateSlug('  Advanced TypeScript   ')).toBe('advanced-typescript');
    });

    it('should handle numbers correctly', () => {
      expect(generateSlug('Top 10 Programming Tips')).toBe('top-10-programming-tips');
    });

    it('should handle mixed case', () => {
      expect(generateSlug('FULL Stack Development BOOTCAMP')).toBe('full-stack-development-bootcamp');
    });

    it('should handle apostrophes and quotes', () => {
      expect(generateSlug("John's Python Class")).toBe('johns-python-class');
    });

    it('should handle dots and slashes', () => {
      expect(generateSlug('Node.js/Express Basics')).toBe('nodejsexpress-basics');
    });

    it('should return empty string for empty input', () => {
      expect(generateSlug('')).toBe('');
    });

    it('should handle already slugged text', () => {
      expect(generateSlug('already-slugged-text')).toBe('already-slugged-text');
    });
  });
});

describe('ServiceListingService.createBulk', () => {
  let serviceListingService: any;
  let mockRepository: any;
  let mockTagService: any;

  beforeEach(() => {
    mockRepository = {
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation(async (entity) => ({ ...entity, id: 'id-' + Math.random().toString(16).slice(2) })),
      findOne: jest.fn().mockResolvedValue(null),
    };
    mockTagService = {
      findTagsBySlugs: jest.fn().mockResolvedValue([]),
    };

    const FileUploadService = {};
    const ConfigService = {};

    serviceListingService = new ServiceListingService(mockRepository, mockTagService, FileUploadService, ConfigService);
  });

  it('creates multiple listings and returns created items', async () => {
    const payload = [
      {
        title: 'First Listing',
        description: 'Description 1',
        price: 100,
        category: 'technical',
      },
      {
        title: 'Second Listing',
        description: 'Description 2',
        price: 200,
        category: 'business',
      },
    ];

    const result = await serviceListingService.createBulk(payload, 'mentor-123');

    expect(result).toHaveLength(2);
    expect(mockRepository.create).toHaveBeenCalledTimes(2);
    expect(mockRepository.save).toHaveBeenCalledTimes(2);
    expect(result[0].mentorId).toBe('mentor-123');
    expect(result[1].mentorId).toBe('mentor-123');
  });

  it('throws BadRequestException if payload is empty', async () => {
    await expect(serviceListingService.createBulk([], 'mentor-123')).rejects.toThrow('Listing array must be provided and contain at least one item');
  });
});

describe('ServiceListingService.findOneWithReviews', () => {
  let serviceListingService: any;
  let mockRepository: any;

  beforeEach(() => {
    mockRepository = {
      createQueryBuilder: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };

    const mockTagService = {};
    const FileUploadService = {};
    const ConfigService = {};

    serviceListingService = new ServiceListingService(mockRepository, mockTagService, FileUploadService, ConfigService);
  });

  it('returns listing with reviews included', async () => {
    const mockListing = {
      id: 'listing-1',
      title: 'Mock Listing',
      reviews: [
        { id: 'review-1', rating: 5, comment: 'Great!' },
        { id: 'review-2', rating: 4, comment: 'Good' },
      ],
    };

    mockRepository.getOne.mockResolvedValue(mockListing);

    const result = await serviceListingService.findOneWithReviews('listing-1');

    expect(result).toEqual(mockListing);
    expect(result.reviews).toHaveLength(2);
    expect(mockRepository.leftJoinAndSelect).toHaveBeenCalledWith('listing.reviews', 'review', 'review.listingId = listing.id');
  });

  it('executes proper query with reviews sorted by createdAt DESC', async () => {
    mockRepository.getOne.mockResolvedValue(null);

    await serviceListingService.findOneWithReviews('listing-1');

    expect(mockRepository.orderBy).toHaveBeenCalledWith('review.createdAt', 'DESC');
  });
});
