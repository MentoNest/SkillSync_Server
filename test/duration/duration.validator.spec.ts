import { IsValidDurationConstraint, IsValidDuration, DurationUnit } from '../../src/common/decorators/duration.decorator';
import { validate } from 'class-validator';

/**
 * Test DTO for service listings with duration in hours
 */
class TestServiceListingDto {
  @IsValidDuration({ min: 0.5, max: 24, unit: DurationUnit.HOURS })
  duration: number;
}

/**
 * Test DTO for bookings with duration in minutes
 */
class TestBookingDto {
  @IsValidDuration({ min: 15, max: 480, unit: DurationUnit.MINUTES })
  duration: number;
}

describe('Duration Validation', () => {
  describe('IsValidDurationConstraint', () => {
    it('should accept valid duration within range (hours)', async () => {
      const dto = new TestServiceListingDto();
      dto.duration = 1.5; // 1.5 hours

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept valid duration at minimum boundary (hours)', async () => {
      const dto = new TestServiceListingDto();
      dto.duration = 0.5; // Minimum 30 minutes

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept valid duration at maximum boundary (hours)', async () => {
      const dto = new TestServiceListingDto();
      dto.duration = 24; // Maximum 24 hours

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject duration below minimum (hours)', async () => {
      const dto = new TestServiceListingDto();
      dto.duration = 0.3; // Below 0.5 hours minimum

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isValidDuration');
      expect(errors[0].constraints?.isValidDuration).toContain('at least 0.5 hours');
    });

    it('should reject duration above maximum (hours)', async () => {
      const dto = new TestServiceListingDto();
      dto.duration = 25; // Above 24 hours maximum

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isValidDuration');
      expect(errors[0].constraints?.isValidDuration).toContain('at most 24 hours');
    });

    it('should accept valid duration within range (minutes)', async () => {
      const dto = new TestBookingDto();
      dto.duration = 60; // 60 minutes

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept valid duration at minimum boundary (minutes)', async () => {
      const dto = new TestBookingDto();
      dto.duration = 15; // Minimum 15 minutes

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept valid duration at maximum boundary (minutes)', async () => {
      const dto = new TestBookingDto();
      dto.duration = 480; // Maximum 480 minutes (8 hours)

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject duration below minimum (minutes)', async () => {
      const dto = new TestBookingDto();
      dto.duration = 10; // Below 15 minutes minimum

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isValidDuration');
      expect(errors[0].constraints?.isValidDuration).toContain('at least 15 minutes');
    });

    it('should reject duration above maximum (minutes)', async () => {
      const dto = new TestBookingDto();
      dto.duration = 500; // Above 480 minutes maximum

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isValidDuration');
      expect(errors[0].constraints?.isValidDuration).toContain('at most 480 minutes');
    });

    it('should reject non-numeric values', async () => {
      const dto: any = new TestBookingDto();
      dto.duration = 'invalid'; // String instead of number

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject NaN values', async () => {
      const dto: any = new TestBookingDto();
      dto.duration = NaN;

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject negative values', async () => {
      const dto = new TestBookingDto();
      dto.duration = -30;

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Duration Unit Enum', () => {
    it('should have MINUTES unit', () => {
      expect(DurationUnit.MINUTES).toBe('minutes');
    });

    it('should have HOURS unit', () => {
      expect(DurationUnit.HOURS).toBe('hours');
    });
  });
});
