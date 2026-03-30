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
    const NotificationService = {
      createForAdmins: jest.fn(),
      createForUser: jest.fn(),
    };

    serviceListingService = new ServiceListingService(mockRepository, mockTagService, FileUploadService, ConfigService, NotificationService);
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
    const NotificationService = {
      createForAdmins: jest.fn(),
      createForUser: jest.fn(),
    };

    serviceListingService = new ServiceListingService(mockRepository, mockTagService, FileUploadService, ConfigService, NotificationService);
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

describe('ServiceListingService - RBAC', () => {
  let serviceListingService: any;
  let mockRepository: any;
  let mockTagService: any;

  beforeEach(() => {
    mockRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockTagService = {
      findTagsBySlugs: jest.fn().mockResolvedValue([]),
    };

    const FileUploadService = {};
    const ConfigService = {};
    const NotificationService = {
      createForAdmins: jest.fn(),
      createForUser: jest.fn(),
    };

    serviceListingService = new ServiceListingService(mockRepository, mockTagService, FileUploadService, ConfigService, NotificationService);
  });

  describe('adminUpdate', () => {
    it('allows admin to update any listing without ownership check', async () => {
      const mockListing = {
        id: 'listing-1',
        mentorId: 'mentor-999',
        title: 'Original Title',
        isDeleted: false,
        tags: [],
      };

      mockRepository.findOne.mockResolvedValue(mockListing);
      mockRepository.save.mockResolvedValue({ ...mockListing, title: 'Updated Title' });

      const result = await serviceListingService.adminUpdate('listing-1', { title: 'Updated Title' });

      expect(result.title).toBe('Updated Title');
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('throws NotFoundException if listing does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(serviceListingService.adminUpdate('listing-1', { title: 'Updated Title' })).rejects.toThrow('Service listing not found');
    });
  });

  describe('adminRemove', () => {
    it('allows admin to delete any listing without ownership check', async () => {
      const mockListing = {
        id: 'listing-1',
        mentorId: 'mentor-999',
        isDeleted: false,
      };

      mockRepository.findOne.mockResolvedValue(mockListing);
      mockRepository.save.mockResolvedValue({ ...mockListing, isDeleted: true });

      await serviceListingService.adminRemove('listing-1');

      expect(mockRepository.save).toHaveBeenCalledWith(expect.objectContaining({ isDeleted: true }));
    });

    it('throws NotFoundException if listing does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(serviceListingService.adminRemove('listing-1')).rejects.toThrow('Service listing not found');
    });
  });

  describe('handleSoftDeletedListingCleanup', () => {
    it('hard deletes soft-deleted listings older than retention threshold', async () => {
      const fakeQueryBuilder: any = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 5 }),
      };

      mockRepository.createQueryBuilder = jest.fn().mockReturnValue(fakeQueryBuilder);
      mockRepository.findOne.mockResolvedValue(null);

      await serviceListingService.handleSoftDeletedListingCleanup();

      expect(mockRepository.createQueryBuilder).toHaveBeenCalled();
      expect(fakeQueryBuilder.delete).toHaveBeenCalled();
      expect(fakeQueryBuilder.from).toHaveBeenCalled();
      expect(fakeQueryBuilder.where).toHaveBeenCalledWith('isDeleted = :isDeleted', { isDeleted: true });
      expect(fakeQueryBuilder.andWhere).toHaveBeenCalledWith('deletedAt IS NOT NULL');
      expect(fakeQueryBuilder.andWhere).toHaveBeenCalledWith(expect.stringContaining('deletedAt <= :thresholdDate'), expect.any(Object));
      expect(fakeQueryBuilder.execute).toHaveBeenCalled();
    });
  });
});

describe('ServiceListingService - Notifications', () => {
  let serviceListingService: any;
  let mockRepository: any;
  let mockTagService: any;
  let mockNotificationService: any;

  beforeEach(() => {
    mockRepository = {
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation(async (entity) => ({ ...entity, id: entity.id ?? 'listing-1' })),
      findOne: jest.fn(),
    };

    mockTagService = {
      findTagsBySlugs: jest.fn().mockResolvedValue([]),
    };

    mockNotificationService = {
      createForAdmins: jest.fn().mockResolvedValue([]),
      createForUser: jest.fn().mockResolvedValue({}),
    };

    const FileUploadService = {};
    const ConfigService = {};

    serviceListingService = new ServiceListingService(
      mockRepository,
      mockTagService,
      FileUploadService,
      ConfigService,
      mockNotificationService,
    );
  });

  it('notifies admins when a listing is created', async () => {
    mockRepository.findOne.mockResolvedValue(null);

    await serviceListingService.create(
      {
        title: 'TypeScript Coaching',
        description: 'Deep dive session',
        price: 100,
        category: 'technical',
      },
      'mentor-1',
    );

    expect(mockNotificationService.createForAdmins).toHaveBeenCalled();
  });

  it('notifies listing owner when admin approves a listing', async () => {
    const existing = {
      id: 'listing-1',
      title: 'System Design',
      mentorId: 'mentor-1',
      approvalStatus: 'pending',
      isDeleted: false,
      isActive: false,
      isDraft: true,
    };

    mockRepository.findOne.mockResolvedValue(existing);
    mockRepository.save.mockResolvedValue({
      ...existing,
      approvalStatus: 'approved',
      isActive: true,
      isDraft: false,
    });

    await serviceListingService.approveListing('listing-1', 'approved', undefined, 'admin-1');

    expect(mockNotificationService.createForUser).toHaveBeenCalled();
    expect(mockNotificationService.createForUser).toHaveBeenCalledWith(
      'mentor-1',
      expect.any(String),
      expect.any(String),
      expect.stringContaining('now live'),
      expect.any(Object),
    );
  });
});
