import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { BookingConflictGuard } from '../guards/booking-conflict.guard';
import { BookingConflictService } from '../booking-conflict.service';
import { SKIP_CONFLICT_CHECK_KEY } from '../decorators/skip-conflict-check.decorator';
import { CONFLICT_BUFFER_KEY } from '../decorators/conflict-buffer.decorator';

const FUTURE_BASE = new Date(Date.now() + 1000 * 60 * 60 * 24);
function makeDate(h: number) {
  const d = new Date(FUTURE_BASE);
  d.setHours(10 + h, 0, 0, 0);
  return d.toISOString();
}

function makeContext(body: Record<string, unknown>, meta?: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ body }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('BookingConflictGuard', () => {
  let guard: BookingConflictGuard;
  let conflictService: jest.Mocked<BookingConflictService>;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(async () => {
    conflictService = {
      assertNoConflict: jest.fn().mockResolvedValue(undefined),
      detectConflicts: jest.fn(),
    } as any;

    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingConflictGuard,
        { provide: BookingConflictService, useValue: conflictService },
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();

    guard = module.get<BookingConflictGuard>(BookingConflictGuard);
  });

  it('returns true and calls assertNoConflict for valid body', async () => {
    const ctx = makeContext({
      listingId: 'l1',
      startTime: makeDate(0),
      endTime: makeDate(1),
    });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(conflictService.assertNoConflict).toHaveBeenCalledWith(
      expect.objectContaining({ listingId: 'l1' }),
      expect.objectContaining({ bufferMs: 0 }),
    );
  });

  it('skips conflict check when @SkipConflictCheck() is set', async () => {
    reflector.getAllAndOverride.mockImplementation((key) =>
      key === SKIP_CONFLICT_CHECK_KEY ? true : undefined,
    );

    const ctx = makeContext({
      listingId: 'l1',
      startTime: makeDate(0),
      endTime: makeDate(1),
    });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(conflictService.assertNoConflict).not.toHaveBeenCalled();
  });

  it('returns true silently when required fields are missing', async () => {
    const ctx = makeContext({ someOtherField: 'value' });
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(conflictService.assertNoConflict).not.toHaveBeenCalled();
  });

  it('passes bufferMs derived from @ConflictBuffer() decorator', async () => {
    reflector.getAllAndOverride.mockImplementation((key) =>
      key === CONFLICT_BUFFER_KEY ? 15 : undefined, // 15 minutes
    );

    const ctx = makeContext({
      listingId: 'l1',
      startTime: makeDate(0),
      endTime: makeDate(1),
    });

    await guard.canActivate(ctx);

    expect(conflictService.assertNoConflict).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bufferMs: 15 * 60 * 1000 }),
    );
  });

  it('propagates ConflictException thrown by service', async () => {
    conflictService.assertNoConflict.mockRejectedValue(
      new ConflictException('Slot taken'),
    );

    const ctx = makeContext({
      listingId: 'l1',
      startTime: makeDate(0),
      endTime: makeDate(1),
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ConflictException);
  });

  it('passes excludeBookingId from body to assertNoConflict', async () => {
    const ctx = makeContext({
      listingId: 'l1',
      startTime: makeDate(0),
      endTime: makeDate(1),
      excludeBookingId: 'existing-booking-id',
    });

    await guard.canActivate(ctx);

    expect(conflictService.assertNoConflict).toHaveBeenCalledWith(
      expect.objectContaining({ excludeBookingId: 'existing-booking-id' }),
      expect.anything(),
    );
  });
});
