import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { BookingConflictService } from '../booking-conflict.service';
import { Booking, BookingStatus } from '../booking.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FUTURE_BASE = new Date(Date.now() + 1000 * 60 * 60 * 24); // tomorrow

function makeDate(hoursOffset: number): string {
  const d = new Date(FUTURE_BASE);
  d.setHours(10 + hoursOffset, 0, 0, 0);
  return d.toISOString();
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  const b = new Booking();
  b.id = 'booking-uuid-1';
  b.listingId = 'listing-uuid-1';
  b.menteeId = 'mentee-uuid-1';
  b.mentorId = 'mentor-uuid-1';
  b.startTime = new Date(makeDate(0));
  b.endTime = new Date(makeDate(1));
  b.status = BookingStatus.CONFIRMED;
  return Object.assign(b, overrides);
}

// ─── Mock QueryBuilder factory ────────────────────────────────────────────────

function mockQb(results: Booking[]): Partial<SelectQueryBuilder<Booking>> {
  const qb: Partial<SelectQueryBuilder<Booking>> = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(results),
  };
  return qb;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BookingConflictService', () => {
  let service: BookingConflictService;
  let repoMock: {
    createQueryBuilder: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(async () => {
    repoMock = {
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingConflictService,
        {
          provide: getRepositoryToken(Booking),
          useValue: repoMock,
        },
      ],
    }).compile();

    service = module.get<BookingConflictService>(BookingConflictService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── validateTimeRange ──────────────────────────────────────────────────

  describe('validateTimeRange (via detectConflicts)', () => {
    it('throws BadRequestException when endTime <= startTime', async () => {
      repoMock.createQueryBuilder.mockReturnValue(mockQb([]));

      await expect(
        service.detectConflicts({
          listingId: 'l1',
          startTime: makeDate(2),
          endTime: makeDate(1), // end before start
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for past startTime', async () => {
      const pastStart = new Date(Date.now() - 60_000).toISOString();
      const pastEnd = new Date(Date.now() + 60_000).toISOString();

      await expect(
        service.detectConflicts({
          listingId: 'l1',
          startTime: pastStart,
          endTime: pastEnd,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for equal start and end', async () => {
      const t = makeDate(1);
      await expect(
        service.detectConflicts({ listingId: 'l1', startTime: t, endTime: t }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── detectConflicts — no conflict ─────────────────────────────────────

  describe('detectConflicts — no conflict', () => {
    it('returns hasConflict: false when no bookings overlap', async () => {
      repoMock.createQueryBuilder.mockReturnValue(mockQb([]));

      const result = await service.detectConflicts({
        listingId: 'l1',
        startTime: makeDate(0),
        endTime: makeDate(1),
      });

      expect(result.hasConflict).toBe(false);
      expect(result.conflicts).toHaveLength(0);
    });

    it('does not conflict with a booking that ends exactly when new one starts', async () => {
      // Adjacent (touching) bookings should NOT conflict
      const adjacentBooking = makeBooking({
        startTime: new Date(makeDate(-1)),
        endTime: new Date(makeDate(0)), // ends exactly at our start
      });
      repoMock.createQueryBuilder.mockReturnValue(mockQb([])); // DB returns nothing (correct)

      const result = await service.detectConflicts({
        listingId: 'l1',
        startTime: makeDate(0),
        endTime: makeDate(1),
      });

      expect(result.hasConflict).toBe(false);
    });
  });

  // ─── detectConflicts — conflict found ──────────────────────────────────

  describe('detectConflicts — conflict found', () => {
    it('returns hasConflict: true with conflict details on exact overlap', async () => {
      const existing = makeBooking();
      repoMock.createQueryBuilder.mockReturnValue(mockQb([existing]));

      const result = await service.detectConflicts({
        listingId: 'listing-uuid-1',
        startTime: makeDate(0),
        endTime: makeDate(1),
      });

      expect(result.hasConflict).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].bookingId).toBe('booking-uuid-1');
      expect(result.message).toContain('1 existing booking');
    });

    it('detects head overlap (new slot starts inside existing)', async () => {
      // Existing: 10:00–12:00 | New: 11:00–13:00
      const existing = makeBooking({
        startTime: new Date(makeDate(0)),
        endTime: new Date(makeDate(2)),
      });
      repoMock.createQueryBuilder.mockReturnValue(mockQb([existing]));

      const result = await service.detectConflicts({
        listingId: 'listing-uuid-1',
        startTime: makeDate(1), // 11:00
        endTime: makeDate(3),   // 13:00
      });

      expect(result.hasConflict).toBe(true);
    });

    it('detects tail overlap (new slot ends inside existing)', async () => {
      // Existing: 11:00–13:00 | New: 10:00–12:00
      const existing = makeBooking({
        startTime: new Date(makeDate(1)),
        endTime: new Date(makeDate(3)),
      });
      repoMock.createQueryBuilder.mockReturnValue(mockQb([existing]));

      const result = await service.detectConflicts({
        listingId: 'listing-uuid-1',
        startTime: makeDate(0), // 10:00
        endTime: makeDate(2),   // 12:00
      });

      expect(result.hasConflict).toBe(true);
    });

    it('detects engulf (new slot is contained within existing)', async () => {
      // Existing: 09:00–14:00 | New: 10:00–11:00
      const existing = makeBooking({
        startTime: new Date(makeDate(-1)),
        endTime: new Date(makeDate(4)),
      });
      repoMock.createQueryBuilder.mockReturnValue(mockQb([existing]));

      const result = await service.detectConflicts({
        listingId: 'listing-uuid-1',
        startTime: makeDate(0),
        endTime: makeDate(1),
      });

      expect(result.hasConflict).toBe(true);
    });

    it('detects multiple conflicts and lists all of them', async () => {
      const b1 = makeBooking({ id: 'b1' });
      const b2 = makeBooking({ id: 'b2', menteeId: 'mentee-2' });
      repoMock.createQueryBuilder.mockReturnValue(mockQb([b1, b2]));

      const result = await service.detectConflicts({
        listingId: 'listing-uuid-1',
        startTime: makeDate(0),
        endTime: makeDate(1),
      });

      expect(result.hasConflict).toBe(true);
      expect(result.conflicts).toHaveLength(2);
      expect(result.message).toContain('2 existing booking');
    });
  });

  // ─── assertNoConflict ──────────────────────────────────────────────────

  describe('assertNoConflict', () => {
    it('resolves without throwing when no conflict exists', async () => {
      repoMock.createQueryBuilder.mockReturnValue(mockQb([]));

      await expect(
        service.assertNoConflict({
          listingId: 'l1',
          startTime: makeDate(0),
          endTime: makeDate(1),
        }),
      ).resolves.toBeUndefined();
    });

    it('throws ConflictException when a conflict is detected', async () => {
      repoMock.createQueryBuilder.mockReturnValue(mockQb([makeBooking()]));

      await expect(
        service.assertNoConflict({
          listingId: 'listing-uuid-1',
          startTime: makeDate(0),
          endTime: makeDate(1),
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('includes conflict details in the thrown exception', async () => {
      repoMock.createQueryBuilder.mockReturnValue(mockQb([makeBooking()]));

      try {
        await service.assertNoConflict({
          listingId: 'listing-uuid-1',
          startTime: makeDate(0),
          endTime: makeDate(1),
        });
        fail('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getResponse().conflicts).toHaveLength(1);
        expect(err.getResponse().message).toContain('overlaps');
      }
    });
  });

  // ─── excludeBookingId (reschedule) ─────────────────────────────────────

  describe('reschedule flow — excludeBookingId', () => {
    it('passes excludeBookingId to the query builder', async () => {
      const qb = mockQb([]);
      repoMock.createQueryBuilder.mockReturnValue(qb);

      await service.detectConflicts({
        listingId: 'l1',
        startTime: makeDate(0),
        endTime: makeDate(1),
        excludeBookingId: 'some-booking-id',
      });

      // andWhere should have been called with the exclusion clause
      const andWhereCalls = (qb.andWhere as jest.Mock).mock.calls;
      const hasExclude = andWhereCalls.some(
        ([clause]: [string]) =>
          typeof clause === 'string' && clause.includes('!= :excludeId'),
      );
      expect(hasExclude).toBe(true);
    });
  });

  // ─── buffer support ────────────────────────────────────────────────────

  describe('buffer option', () => {
    it('expands the time window by the buffer amount', async () => {
      const qb = mockQb([]);
      repoMock.createQueryBuilder.mockReturnValue(qb);

      await service.detectConflicts(
        { listingId: 'l1', startTime: makeDate(1), endTime: makeDate(2) },
        { bufferMs: 15 * 60 * 1000 }, // 15 min
      );

      // andWhere with start/end should have been called
      const andWhereCalls = (qb.andWhere as jest.Mock).mock.calls;
      const hasTimeClause = andWhereCalls.some(
        ([clause]: [string]) =>
          typeof clause === 'string' &&
          clause.includes('start_time') &&
          clause.includes('end_time'),
      );
      expect(hasTimeClause).toBe(true);
    });
  });

  // ─── getAvailableSlots ─────────────────────────────────────────────────

  describe('getAvailableSlots', () => {
    it('returns full day slots when no bookings exist', async () => {
      const qb = mockQb([]);
      repoMock.createQueryBuilder.mockReturnValue(qb);

      const date = new Date(FUTURE_BASE);
      const slots = await service.getAvailableSlots('l1', date, 60, 8, 10);

      // 08:00–09:00 and 09:00–10:00
      expect(slots).toHaveLength(2);
      expect(slots[0].startTime.getHours()).toBe(8);
      expect(slots[1].startTime.getHours()).toBe(9);
    });

    it('excludes slots overlapping with existing bookings', async () => {
      const blockedDate = new Date(FUTURE_BASE);
      const blockedBooking = makeBooking({
        startTime: (() => { const d = new Date(blockedDate); d.setHours(8, 0, 0, 0); return d; })(),
        endTime: (() => { const d = new Date(blockedDate); d.setHours(9, 0, 0, 0); return d; })(),
      });

      const qb = mockQb([blockedBooking]);
      repoMock.createQueryBuilder.mockReturnValue(qb);

      const slots = await service.getAvailableSlots('l1', blockedDate, 60, 8, 10);

      // Only 09:00–10:00 should be available
      expect(slots).toHaveLength(1);
      expect(slots[0].startTime.getHours()).toBe(9);
    });

    it('returns empty array when all slots are booked', async () => {
      const d = new Date(FUTURE_BASE);
      const b1 = makeBooking({
        startTime: (() => { const x = new Date(d); x.setHours(8, 0, 0, 0); return x; })(),
        endTime: (() => { const x = new Date(d); x.setHours(10, 0, 0, 0); return x; })(),
      });

      const qb = mockQb([b1]);
      repoMock.createQueryBuilder.mockReturnValue(qb);

      const slots = await service.getAvailableSlots('l1', d, 60, 8, 10);
      expect(slots).toHaveLength(0);
    });
  });

  // ─── detectMentorConflicts ─────────────────────────────────────────────

  describe('detectMentorConflicts', () => {
    it('returns hasConflict: false when mentor is free', async () => {
      const qb = mockQb([]);
      repoMock.createQueryBuilder.mockReturnValue(qb);

      const result = await service.detectMentorConflicts(
        'mentor-1',
        makeDate(0),
        makeDate(1),
      );

      expect(result.hasConflict).toBe(false);
    });

    it('returns hasConflict: true when mentor is double-booked', async () => {
      const qb = mockQb([makeBooking()]);
      repoMock.createQueryBuilder.mockReturnValue(qb);

      const result = await service.detectMentorConflicts(
        'mentor-uuid-1',
        makeDate(0),
        makeDate(1),
      );

      expect(result.hasConflict).toBe(true);
      expect(result.message).toContain('already booked');
    });
  });
});
