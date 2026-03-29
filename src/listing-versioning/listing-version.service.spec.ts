import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ListingVersionService } from '../listing-version.service';
import { ListingVersion, ListingSnapshot } from '../entities/listing-version.entity';
import { Listing, ListingCategory, ListingStatus } from '../entities/listing.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeListing = (overrides: Partial<Listing> = {}): Listing =>
  ({
    id: 'listing-uuid-1',
    title: 'React Mentorship',
    description: 'Weekly 1-on-1 sessions',
    price: 49.99,
    category: ListingCategory.MENTORSHIP,
    status: ListingStatus.DRAFT,
    tags: ['react', 'typescript'],
    durationMinutes: 60,
    coverImageUrl: null,
    metadata: null,
    currentVersion: 1,
    createdBy: 'user-uuid-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  } as Listing);

const makeSnapshot = (overrides: Partial<ListingSnapshot> = {}): ListingSnapshot => ({
  title: 'React Mentorship',
  description: 'Weekly 1-on-1 sessions',
  price: 49.99,
  category: ListingCategory.MENTORSHIP,
  status: ListingStatus.DRAFT,
  tags: ['react', 'typescript'],
  durationMinutes: 60,
  coverImageUrl: null,
  metadata: null,
  ...overrides,
});

const makeVersion = (overrides: Partial<ListingVersion> = {}): ListingVersion =>
  ({
    id: 'version-uuid-1',
    listingId: 'listing-uuid-1',
    versionNumber: 1,
    snapshot: makeSnapshot(),
    changedFields: [],
    changeNote: 'Initial listing created',
    changedBy: 'user-uuid-1',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  } as ListingVersion);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ListingVersionService', () => {
  let service: ListingVersionService;
  let versionRepo: jest.Mocked<Repository<ListingVersion>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListingVersionService,
        {
          provide: getRepositoryToken(ListingVersion),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ListingVersionService);
    versionRepo = module.get(getRepositoryToken(ListingVersion));
  });

  afterEach(() => jest.clearAllMocks());

  // ─── buildSnapshot ─────────────────────────────────────────────────────────

  describe('buildSnapshot', () => {
    it('extracts all versioned fields from the listing', () => {
      const listing = makeListing();
      const snapshot = service.buildSnapshot(listing);

      expect(snapshot).toEqual<ListingSnapshot>({
        title: listing.title,
        description: listing.description,
        price: listing.price,
        category: listing.category,
        status: listing.status,
        tags: listing.tags,
        durationMinutes: listing.durationMinutes,
        coverImageUrl: null,
        metadata: null,
      });
    });

    it('coerces price to number', () => {
      const listing = makeListing({ price: '49.99' as unknown as number });
      const snapshot = service.buildSnapshot(listing);
      expect(typeof snapshot.price).toBe('number');
    });

    it('defaults null-ish tags to empty array', () => {
      const listing = makeListing({ tags: undefined });
      const snapshot = service.buildSnapshot(listing);
      expect(snapshot.tags).toEqual([]);
    });
  });

  // ─── diffSnapshots ─────────────────────────────────────────────────────────

  describe('diffSnapshots', () => {
    it('returns empty array when prev is null (version 1)', () => {
      const next = makeSnapshot();
      expect(service.diffSnapshots(null, next)).toEqual([]);
    });

    it('returns empty array when snapshots are identical', () => {
      const snap = makeSnapshot();
      expect(service.diffSnapshots(snap, makeSnapshot())).toEqual([]);
    });

    it('detects a changed scalar field', () => {
      const prev = makeSnapshot();
      const next = makeSnapshot({ price: 59.99 });
      const diffs = service.diffSnapshots(prev, next);
      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({ field: 'price', from: 49.99, to: 59.99 });
    });

    it('detects multiple changed fields', () => {
      const prev = makeSnapshot();
      const next = makeSnapshot({
        title: 'Advanced React',
        price: 99.99,
        status: ListingStatus.PUBLISHED,
      });
      const diffs = service.diffSnapshots(prev, next);
      const fields = diffs.map((d) => d.field);
      expect(fields).toContain('title');
      expect(fields).toContain('price');
      expect(fields).toContain('status');
    });

    it('detects array changes', () => {
      const prev = makeSnapshot({ tags: ['react'] });
      const next = makeSnapshot({ tags: ['react', 'typescript'] });
      const diffs = service.diffSnapshots(prev, next);
      expect(diffs[0]).toMatchObject({ field: 'tags' });
    });
  });

  // ─── captureVersion ────────────────────────────────────────────────────────

  describe('captureVersion', () => {
    it('creates and saves a version via the EntityManager', async () => {
      const listing = makeListing({ currentVersion: 1 });
      const mockVersion = makeVersion();
      const manager = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(mockVersion),
        save: jest.fn().mockResolvedValue(mockVersion),
      } as unknown as import('typeorm').EntityManager;

      const result = await service.captureVersion(listing, 'user-uuid-1', 'Initial', manager);

      expect(manager.create).toHaveBeenCalledWith(
        ListingVersion,
        expect.objectContaining({
          listingId: listing.id,
          versionNumber: 1,
          changedBy: 'user-uuid-1',
          changeNote: 'Initial',
        }),
      );
      expect(manager.save).toHaveBeenCalled();
      expect(result).toBe(mockVersion);
    });

    it('fetches previous version and computes diff for version > 1', async () => {
      const prevSnapshot = makeSnapshot({ price: 49.99 });
      const prevVersion = makeVersion({ versionNumber: 1, snapshot: prevSnapshot });
      const listing = makeListing({ currentVersion: 2, price: 59.99 });

      const manager = {
        findOne: jest.fn().mockResolvedValue(prevVersion),
        create: jest.fn().mockImplementation((_, v) => v),
        save: jest.fn().mockImplementation((_, v) => v),
      } as unknown as import('typeorm').EntityManager;

      const result = await service.captureVersion(listing, 'user-uuid-1', null, manager);

      expect(result.changedFields).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'price' })]),
      );
    });
  });

  // ─── getHistory ────────────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('returns paginated version history', async () => {
      const versions = [makeVersion({ versionNumber: 2 }), makeVersion({ versionNumber: 1 })];

      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([versions, 2]),
      };
      versionRepo.createQueryBuilder.mockReturnValue(qbMock as any);

      const result = await service.getHistory('listing-uuid-1', { page: 1, limit: 20 });

      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(1);
      expect(result.data).toHaveLength(2);
    });

    it('adds changedBy filter when provided', async () => {
      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      versionRepo.createQueryBuilder.mockReturnValue(qbMock as any);

      await service.getHistory('listing-uuid-1', { changedBy: 'user-uuid-2' });

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'v.changedBy = :changedBy',
        { changedBy: 'user-uuid-2' },
      );
    });
  });

  // ─── getVersion ────────────────────────────────────────────────────────────

  describe('getVersion', () => {
    it('returns the version when found', async () => {
      const version = makeVersion();
      versionRepo.findOne.mockResolvedValue(version);

      const result = await service.getVersion('listing-uuid-1', 1);
      expect(result).toBe(version);
    });

    it('throws NotFoundException when version does not exist', async () => {
      versionRepo.findOne.mockResolvedValue(null);

      await expect(service.getVersion('listing-uuid-1', 99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── compareVersions ───────────────────────────────────────────────────────

  describe('compareVersions', () => {
    it('throws BadRequestException when v1 === v2', async () => {
      await expect(
        service.compareVersions('listing-uuid-1', { v1: 2, v2: 2 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns diffs with earlier version as v1', async () => {
      const v1 = makeVersion({ versionNumber: 1, snapshot: makeSnapshot({ price: 49.99 }) });
      const v2 = makeVersion({
        id: 'version-uuid-2',
        versionNumber: 2,
        snapshot: makeSnapshot({ price: 59.99 }),
        createdAt: new Date('2024-01-15'),
      });

      versionRepo.findOne
        .mockResolvedValueOnce(v1)
        .mockResolvedValueOnce(v2);

      const result = await service.compareVersions('listing-uuid-1', { v1: 1, v2: 2 });

      expect(result.v1).toBe(1);
      expect(result.v2).toBe(2);
      expect(result.diffs).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'price', from: 49.99, to: 59.99 })]),
      );
    });

    it('normalises order regardless of query param order (v2 < v1)', async () => {
      const v1 = makeVersion({ versionNumber: 1 });
      const v3 = makeVersion({
        versionNumber: 3,
        snapshot: makeSnapshot({ title: 'Updated' }),
        createdAt: new Date('2024-02-01'),
      });

      versionRepo.findOne
        .mockResolvedValueOnce(v3) // query passes v1=3
        .mockResolvedValueOnce(v1); // query passes v2=1

      const result = await service.compareVersions('listing-uuid-1', { v1: 3, v2: 1 });

      // Should always return earlier as result.v1
      expect(result.v1).toBe(1);
      expect(result.v2).toBe(3);
    });
  });
});
