import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ListingService } from '../listing.service';
import { ListingVersionService } from '../listing-version.service';
import { Listing, ListingCategory, ListingStatus } from '../entities/listing.entity';
import { ListingVersion } from '../entities/listing-version.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeListing = (overrides: Partial<Listing> = {}): Listing =>
  ({
    id: 'listing-uuid-1',
    title: 'React Mentorship',
    description: 'Weekly sessions',
    price: 49.99,
    category: ListingCategory.MENTORSHIP,
    status: ListingStatus.DRAFT,
    tags: ['react'],
    durationMinutes: 60,
    coverImageUrl: null,
    metadata: null,
    currentVersion: 3,
    createdBy: 'user-uuid-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-10'),
    ...overrides,
  } as Listing);

const makeVersion = (overrides: Partial<ListingVersion> = {}): ListingVersion =>
  ({
    id: 'ver-uuid-1',
    listingId: 'listing-uuid-1',
    versionNumber: 1,
    snapshot: {
      title: 'Original Title',
      description: 'Original description',
      price: 39.99,
      category: ListingCategory.MENTORSHIP,
      status: ListingStatus.DRAFT,
      tags: ['react'],
      durationMinutes: 60,
      coverImageUrl: null,
      metadata: null,
    },
    changedFields: [],
    changeNote: 'Initial listing created',
    changedBy: 'user-uuid-1',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  } as ListingVersion);

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('ListingService', () => {
  let service: ListingService;
  let listingRepo: { findOne: jest.Mock };
  let versionService: { captureVersion: jest.Mock; buildSnapshot: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    listingRepo = { findOne: jest.fn() };

    versionService = {
      captureVersion: jest.fn().mockResolvedValue({}),
      buildSnapshot: jest.fn(),
    };

    // Default transaction mock: executes the callback with a mock manager
    const makeManager = (listing: Listing) => ({
      findOne: jest.fn().mockResolvedValue(listing),
      create: jest.fn().mockImplementation((_, dto) => ({ ...listing, ...dto })),
      save: jest.fn().mockImplementation((_, entity) => Promise.resolve(entity)),
    });

    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(makeManager(makeListing()))),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListingService,
        { provide: getRepositoryToken(Listing), useValue: listingRepo },
        { provide: ListingVersionService, useValue: versionService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(ListingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('saves the listing, increments to v1, and captures a version', async () => {
      const dto = {
        title: 'New Listing',
        description: 'Description text here',
        price: 49.99,
        category: ListingCategory.MENTORSHIP,
      };

      const savedListing = makeListing({ currentVersion: 1 });

      dataSource.transaction.mockImplementation(async (cb) => {
        const mgr = {
          create: jest.fn().mockReturnValue(savedListing),
          save: jest.fn().mockResolvedValue(savedListing),
        };
        return cb(mgr);
      });

      const result = await service.create(dto as any, 'user-uuid-1');

      expect(result).toMatchObject({ currentVersion: 1 });
      expect(versionService.captureVersion).toHaveBeenCalledWith(
        savedListing,
        'user-uuid-1',
        'Initial listing created',
        expect.anything(),
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the listing when found', async () => {
      const listing = makeListing();
      listingRepo.findOne.mockResolvedValue(listing);

      const result = await service.findOne('listing-uuid-1');
      expect(result).toBe(listing);
    });

    it('throws NotFoundException when listing does not exist', async () => {
      listingRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────

  describe('update', () => {
    it('increments currentVersion and captures a new version', async () => {
      const listing = makeListing({ currentVersion: 2 });

      dataSource.transaction.mockImplementation(async (cb) => {
        const mgr = {
          findOne: jest.fn().mockResolvedValue(listing),
          save: jest.fn().mockResolvedValue({ ...listing, currentVersion: 3 }),
        };
        return cb(mgr);
      });

      const dto = { title: 'Updated Title', changeNote: 'Fixed a typo' };
      const result = await service.update('listing-uuid-1', dto as any, 'user-uuid-1');

      expect(result.currentVersion).toBe(3);
      expect(versionService.captureVersion).toHaveBeenCalledWith(
        expect.objectContaining({ currentVersion: 3 }),
        'user-uuid-1',
        'Fixed a typo',
        expect.anything(),
      );
    });

    it('passes null changeNote when none is provided', async () => {
      const listing = makeListing({ currentVersion: 1 });

      dataSource.transaction.mockImplementation(async (cb) => {
        const mgr = {
          findOne: jest.fn().mockResolvedValue(listing),
          save: jest.fn().mockResolvedValue({ ...listing, currentVersion: 2 }),
        };
        return cb(mgr);
      });

      await service.update('listing-uuid-1', { price: 60 } as any, 'user-uuid-1');

      expect(versionService.captureVersion).toHaveBeenCalledWith(
        expect.anything(),
        'user-uuid-1',
        null,
        expect.anything(),
      );
    });

    it('throws NotFoundException when listing does not exist', async () => {
      dataSource.transaction.mockImplementation(async (cb) => {
        const mgr = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn() };
        return cb(mgr);
      });

      await expect(
        service.update('bad-id', {} as any, 'user-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── revertToVersion ─────────────────────────────────────────────────────

  describe('revertToVersion', () => {
    it('restores snapshot fields and creates a new version', async () => {
      const listing = makeListing({ currentVersion: 3 });
      const targetVersion = makeVersion({
        versionNumber: 1,
        snapshot: {
          title: 'Original Title',
          description: 'Original description',
          price: 39.99,
          category: ListingCategory.MENTORSHIP,
          status: ListingStatus.DRAFT,
          tags: ['react'],
          durationMinutes: 60,
          coverImageUrl: null,
          metadata: null,
        },
      });

      dataSource.transaction.mockImplementation(async (cb) => {
        const mgr = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(listing)       // Listing lookup
            .mockResolvedValueOnce(targetVersion), // ListingVersion lookup
          save: jest.fn().mockResolvedValue({ ...listing, currentVersion: 4, title: 'Original Title' }),
        };
        return cb(mgr);
      });

      const result = await service.revertToVersion(
        'listing-uuid-1',
        1,
        { changeNote: 'Reverting to v1' },
        'user-uuid-1',
      );

      expect(result.revertedFrom).toBe(1);
      expect(result.newVersionNumber).toBe(4);
      expect(versionService.captureVersion).toHaveBeenCalledWith(
        expect.objectContaining({ currentVersion: 4 }),
        'user-uuid-1',
        'Reverting to v1',
        expect.anything(),
      );
    });

    it('throws ForbiddenException when target version is not older than current', async () => {
      const listing = makeListing({ currentVersion: 3 });

      dataSource.transaction.mockImplementation(async (cb) => {
        const mgr = {
          findOne: jest.fn().mockResolvedValue(listing),
          save: jest.fn(),
        };
        return cb(mgr);
      });

      // Trying to revert to v3 while already at v3
      await expect(
        service.revertToVersion('listing-uuid-1', 3, {}, 'user-uuid-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('uses default changeNote when none is provided', async () => {
      const listing = makeListing({ currentVersion: 3 });
      const targetVersion = makeVersion({ versionNumber: 2 });

      dataSource.transaction.mockImplementation(async (cb) => {
        const mgr = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(listing)
            .mockResolvedValueOnce(targetVersion),
          save: jest.fn().mockResolvedValue({ ...listing, currentVersion: 4 }),
        };
        return cb(mgr);
      });

      await service.revertToVersion('listing-uuid-1', 2, {}, 'user-uuid-1');

      expect(versionService.captureVersion).toHaveBeenCalledWith(
        expect.anything(),
        'user-uuid-1',
        'Reverted to version 2',
        expect.anything(),
      );
    });

    it('throws NotFoundException when target version does not exist', async () => {
      const listing = makeListing({ currentVersion: 5 });

      dataSource.transaction.mockImplementation(async (cb) => {
        const mgr = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(listing)
            .mockResolvedValueOnce(null), // target version not found
          save: jest.fn(),
        };
        return cb(mgr);
      });

      await expect(
        service.revertToVersion('listing-uuid-1', 2, {}, 'user-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('removes the listing', async () => {
      const listing = makeListing();
      listingRepo.findOne.mockResolvedValue(listing);

      const removeMethod = jest.fn().mockResolvedValue(undefined);
      (service as any).listingRepo.remove = removeMethod;

      await service.remove('listing-uuid-1', 'user-uuid-1');
      expect(removeMethod).toHaveBeenCalledWith(listing);
    });
  });
});
