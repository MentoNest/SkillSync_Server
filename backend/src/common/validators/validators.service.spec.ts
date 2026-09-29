import { validate } from 'class-validator';
import { IsValidWalletAddress } from './is-valid-wallet-address.validator.js';
import { IsValidTimezone } from './is-valid-timezone.validator.js';
import { IsValidAvailabilitySlot } from './is-valid-availability-slot.validator.js';
import { IsAfterDate } from './is-after-date.validator.js';

class TestWalletDto {
  @IsValidWalletAddress()
  walletAddress: string;

  constructor(walletAddress: string) {
    this.walletAddress = walletAddress;
  }
}

class TestTimezoneDto {
  @IsValidTimezone()
  timezone: string;

  constructor(timezone: string) {
    this.timezone = timezone;
  }
}

class TestSlotDto {
  @IsValidAvailabilitySlot()
  slot: any;

  constructor(slot: any) {
    this.slot = slot;
  }
}

class TestAfterDateDto {
  startDate?: Date;

  @IsAfterDate((obj) => obj.startDate)
  endDate: any;

  constructor(endDate: any, startDate?: Date) {
    this.endDate = endDate;
    this.startDate = startDate;
  }
}

class TestAfterNowDto {
  @IsAfterDate()
  futureDate: any;

  constructor(futureDate: any) {
    this.futureDate = futureDate;
  }
}

describe('Custom Validators', () => {
  describe('IsValidWalletAddress', () => {
    it('should validate a correct Stellar address', async () => {
      const dto = new TestWalletDto('GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ');
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject an invalid Stellar address (too short)', async () => {
      const dto = new TestWalletDto('INVALID');
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject an address that does not start with G', async () => {
      const dto = new TestWalletDto('AA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ');
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsValidTimezone', () => {
    it('should validate a valid IANA timezone', async () => {
      const dto = new TestTimezoneDto('America/New_York');
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should validate UTC timezone', async () => {
      const dto = new TestTimezoneDto('UTC');
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject an invalid timezone', async () => {
      const dto = new TestTimezoneDto('Invalid/Timezone');
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsValidAvailabilitySlot', () => {
    it('should validate a correct availability slot', async () => {
      const dto = new TestSlotDto({
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid dayOfWeek', async () => {
      const dto = new TestSlotDto({
        dayOfWeek: 7, // Invalid (should be 0-6)
        startTime: '09:00',
        endTime: '17:00',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid time format', async () => {
      const dto = new TestSlotDto({
        dayOfWeek: 1,
        startTime: '25:00', // Invalid hour
        endTime: '17:00',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject end time before start time', async () => {
      const dto = new TestSlotDto({
        dayOfWeek: 1,
        startTime: '17:00',
        endTime: '09:00',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsAfterDate', () => {
    it('should pass when date is after current time by default', async () => {
      const future = new Date(Date.now() + 60000);
      const dto = new TestAfterNowDto(future);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when date is in the past by default', async () => {
      const past = new Date(Date.now() - 60000);
      const dto = new TestAfterNowDto(past);
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should pass when endDate is after startDate', async () => {
      const start = new Date('2026-01-01T10:00:00Z');
      const end = new Date('2026-01-01T11:00:00Z');
      const dto = new TestAfterDateDto(end, start);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail when endDate is before startDate', async () => {
      const start = new Date('2026-01-01T12:00:00Z');
      const end = new Date('2026-01-01T11:00:00Z');
      const dto = new TestAfterDateDto(end, start);
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when value is not a valid date', async () => {
      const dto = new TestAfterDateDto('invalid-date' as any);
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});