import { validate } from 'class-validator';
import { CreateSlotDto, UpdateSlotDto, CreateExceptionDto } from './availability.dto';

describe('Availability DTOs', () => {
  describe('CreateSlotDto', () => {
    it('should validate a correct slot creation request', async () => {
      const dto = new CreateSlotDto();
      dto.dayOfWeek = 1;
      dto.startTime = '09:00';
      dto.endTime = '17:00';
      dto.timezone = 'America/New_York';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid day of week (negative)', async () => {
      const dto = new CreateSlotDto();
      dto.dayOfWeek = -1;
      dto.startTime = '09:00';
      dto.endTime = '17:00';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid day of week (greater than 6)', async () => {
      const dto = new CreateSlotDto();
      dto.dayOfWeek = 7;
      dto.startTime = '09:00';
      dto.endTime = '17:00';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid time format', async () => {
      const dto = new CreateSlotDto();
      dto.dayOfWeek = 1;
      dto.startTime = '9:00';
      dto.endTime = '17:00';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject end time before start time', async () => {
      const dto = new CreateSlotDto();
      dto.dayOfWeek = 1;
      dto.startTime = '17:00';
      dto.endTime = '09:00';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid timezone', async () => {
      const dto = new CreateSlotDto();
      dto.dayOfWeek = 1;
      dto.startTime = '09:00';
      dto.endTime = '17:00';
      dto.timezone = 'Invalid/Timezone';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('UpdateSlotDto', () => {
    it('should validate a partial update with valid data', async () => {
      const dto = new UpdateSlotDto();
      dto.startTime = '10:00';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate empty update (all optional)', async () => {
      const dto = new UpdateSlotDto();

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid day of week in update', async () => {
      const dto = new UpdateSlotDto();
      dto.dayOfWeek = 8;

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('CreateExceptionDto', () => {
    it('should validate a correct exception creation request', async () => {
      const dto = new CreateExceptionDto();
      dto.exceptionDate = '2024-01-15';
      dto.startTime = '09:00';
      dto.endTime = '17:00';
      dto.reason = 'Holiday';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid date format', async () => {
      const dto = new CreateExceptionDto();
      dto.exceptionDate = '01/15/2024';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject end time before start time', async () => {
      const dto = new CreateExceptionDto();
      dto.exceptionDate = '2024-01-15';
      dto.startTime = '17:00';
      dto.endTime = '09:00';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should validate exception with only required fields', async () => {
      const dto = new CreateExceptionDto();
      dto.exceptionDate = '2024-01-15';

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
