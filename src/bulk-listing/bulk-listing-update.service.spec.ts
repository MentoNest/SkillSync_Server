import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { BulkListingUpdateService } from './bulk-listing-update.service';
import { Listing } from './entities/listing.entity';
import { ListingStatus } from './dto/bulk-listing-update.dto';

// ─── Mock factory helpers ────────────────────────────────────────────────────

const OWNER_ID = 'user-uuid-owner';
const OTHER_ID = 'user-uuid-other';

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return Object.assign(new Listing(), {
    id: 'listing-uuid-1',
    title: 'Original Title',
    description: null,
    status: ListingStatus.DRAFT,
    price: 0,
    category: null,
    isFeatured: false,
    maxMentees: null,
    ownerId: OWNER_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeQueryRunner(saveImpl?: () => Promise<void>) {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    manager: {
      save: saveImpl
        ? jest.fn().mockImplementation(saveImpl)
        : jest.fn().mockResolvedValue(undefined),
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BulkListingUpdateService', () => {
  let service: BulkListingUpdateService;
  let repoFind: jest.Mock;
  let repoSave: jest.Mock;
  let createQueryRunner: jest.Mock;

  beforeEach(async () => {
    repoFind = jest.fn();
    repoSave = jest.fn();
    createQueryRunner = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulkListingUpdateService,
        {
          provide: getRepositoryToken(Listing),
          useValue: {
            find: repoFind,
            save: repoSave,
            manager: {
              connection: { createQueryRunner },
            },
          },
        },
      ],
    }).compile();

    service = module.get(BulkListingUpdateService);
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  describe('bulkUpdate – success scenarios', () => {
    it('returns 100 % success when all listings exist and belong to caller', async () => {
      const l1 = makeListing({ id: 'id-1' });
      const l2 = makeListing({ id: 'id-2' });
      repoFind.mockResolvedValue([l1, l2]);
      createQueryRunner.mockReturnValue(makeQueryRunner());

      const result = await service.bulkUpdate(
        {
          updates: [
            { id: 'id-1', title: 'New Title A' },
            { id: 'id-2', status: ListingStatus.ACTIVE, price: 5000 },
          ],
        },
        OWNER_ID,
      );

      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results.every((r) => r.success)).toBe(true);
    });

    it('applies only the supplied patch fields and leaves the rest intact', async () => {
      const listing = makeListing({ id: 'id-1', title: 'Keep me', price: 999 });
      repoFind.mockResolvedValue([listing]);
      createQueryRunner.mockReturnValue(makeQueryRunner());

      await service.bulkUpdate(
        { updates: [{ id: 'id-1', status: ListingStatus.ACTIVE }] },
        OWNER_ID,
      );

      // title and price must be untouched
      expect(listing.title).toBe('Keep me');
      expect(listing.price).toBe(999);
      expect(listing.status).toBe(ListingStatus.ACTIVE);
    });

    it('processes listings in CHUNK_SIZE batches (20)', async () => {
      const listings = Array.from({ length: 45 }, (_, i) =>
        makeListing({ id: `id-${i}` }),
      );
      repoFind.mockResolvedValue(listings);

      const qr = makeQueryRunner();
      createQueryRunner.mockReturnValue(qr);

      await service.bulkUpdate(
        { updates: listings.map((l) => ({ id: l.id, title: 'x' })) },
        OWNER_ID,
      );

      // 45 listings → 3 chunks (20 + 20 + 5) → 3 transactions
      expect(createQueryRunner).toHaveBeenCalledTimes(3);
    });
  });

  // ── Ownership ──────────────────────────────────────────────────────────────

  describe('bulkUpdate – ownership enforcement', () => {
    it('marks items as failed with Forbidden when owner does not match', async () => {
      const listing = makeListing({ id: 'id-1', ownerId: OTHER_ID });
      repoFind.mockResolvedValue([listing]);

      const result = await service.bulkUpdate(
        { updates: [{ id: 'id-1', title: 'Hack!' }] },
        OWNER_ID,
      );

      expect(result.failed).toBe(1);
      expect(result.results[0].error).toBe('Forbidden');
    });

    it('mixes success and forbidden in the same request', async () => {
      const mine = makeListing({ id: 'mine', ownerId: OWNER_ID });
      const theirs = makeListing({ id: 'theirs', ownerId: OTHER_ID });
      repoFind.mockResolvedValue([mine, theirs]);
      createQueryRunner.mockReturnValue(makeQueryRunner());

      const result = await service.bulkUpdate(
        {
          updates: [
            { id: 'mine', title: 'OK' },
            { id: 'theirs', title: 'Nope' },
          ],
        },
        OWNER_ID,
      );

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results.find((r) => r.id === 'mine')?.success).toBe(true);
      expect(result.results.find((r) => r.id === 'theirs')?.success).toBe(false);
    });
  });

  // ── Not found ──────────────────────────────────────────────────────────────

  describe('bulkUpdate – not-found handling', () => {
    it('marks missing IDs as failed without throwing', async () => {
      repoFind.mockResolvedValue([]); // nothing found

      const result = await service.bulkUpdate(
        { updates: [{ id: 'ghost-id', title: 'Boo' }] },
        OWNER_ID,
      );

      expect(result.failed).toBe(1);
      expect(result.results[0].error).toBe('Listing not found');
    });
  });

  // ── Error resilience ───────────────────────────────────────────────────────

  describe('bulkUpdate – DB error resilience', () => {
    it('falls back to per-item saves when a chunk transaction fails', async () => {
      const l1 = makeListing({ id: 'id-1' });
      const l2 = makeListing({ id: 'id-2' });
      repoFind.mockResolvedValue([l1, l2]);

      const failingQr = makeQueryRunner(() => {
        throw new Error('deadlock');
      });
      createQueryRunner.mockReturnValue(failingQr);

      // Per-item fallback — l1 succeeds, l2 fails
      repoSave
        .mockResolvedValueOnce(l1)
        .mockRejectedValueOnce(new Error('constraint violation'));

      const result = await service.bulkUpdate(
        {
          updates: [
            { id: 'id-1', title: 'A' },
            { id: 'id-2', title: 'B' },
          ],
        },
        OWNER_ID,
      );

      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results.find((r) => r.id === 'id-2')?.error).toMatch(
        /constraint violation/,
      );
    });

    it('always releases the query runner even when an error occurs', async () => {
      const listing = makeListing({ id: 'id-1' });
      repoFind.mockResolvedValue([listing]);

      const qr = makeQueryRunner(() => {
        throw new Error('oops');
      });
      createQueryRunner.mockReturnValue(qr);
      repoSave.mockResolvedValue(listing);

      await service.bulkUpdate({ updates: [{ id: 'id-1' }] }, OWNER_ID);

      expect(qr.release).toHaveBeenCalled();
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe('bulkUpdate – edge cases', () => {
    it('handles a single-item update', async () => {
      const listing = makeListing({ id: 'id-1' });
      repoFind.mockResolvedValue([listing]);
      createQueryRunner.mockReturnValue(makeQueryRunner());

      const result = await service.bulkUpdate(
        { updates: [{ id: 'id-1', isFeatured: true }] },
        OWNER_ID,
      );

      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(listing.isFeatured).toBe(true);
    });

    it('returns correct totals when all items fail', async () => {
      repoFind.mockResolvedValue([]);

      const result = await service.bulkUpdate(
        {
          updates: [
            { id: 'ghost-1' },
            { id: 'ghost-2' },
          ],
        },
        OWNER_ID,
      );

      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(2);
    });
  });
});
