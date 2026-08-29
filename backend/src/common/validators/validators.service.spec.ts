import { validate } from 'class-validator';
import { IsValidWalletAddress } from './is-valid-wallet-address.validator';
import { IsValidTimezone } from './is-valid-timezone.validator';
import { IsValidAvailabilitySlot } from './is-valid-availability-slot.validator';

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
});