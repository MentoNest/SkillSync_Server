import { validate } from 'class-validator';
import {
  IsStellarAddress,
  IsStellarSignature,
  IsValidTimezone,
  IsAfterDate,
  IsTimeFormat,
  IsDateFormat,
  IsISODate,
} from './custom-validators';

class TestStellarAddressDto {
  @IsStellarAddress()
  walletAddress: string;
}

class TestStellarSignatureDto {
  @IsStellarSignature()
  signature: string;
}

class TestTimezoneDto {
  @IsValidTimezone()
  timezone: string;
}

class TestAfterDateDto {
  @IsDateFormat()
  startDate: string;

  @IsDateFormat()
  @IsAfterDate('startDate')
  endDate: string;
}

class TestTimeFormatDto {
  @IsTimeFormat()
  time: string;
}

class TestDateFormatDto {
  @IsDateFormat()
  date: string;
}

class TestISODateDto {
  @IsISODate()
  date: string;
}

describe('Custom Validators', () => {
  describe('IsStellarAddress', () => {
    it('should validate a correct Stellar address', async () => {
      const dto = new TestStellarAddressDto();
      // Valid Stellar address: starts with G, 56 characters total, base32 alphabet (A-Z, 2-7)
      dto.walletAddress = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject an invalid Stellar address (wrong prefix)', async () => {
      const dto = new TestStellarAddressDto();
      dto.walletAddress = 'AABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].constraints).toHaveProperty('isStellarAddress');
    });

    it('should reject an invalid Stellar address (wrong length)', async () => {
      const dto = new TestStellarAddressDto();
      dto.walletAddress = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject a non-string value', async () => {
      const dto = new TestStellarAddressDto();
      dto.walletAddress = 123 as any;
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsStellarSignature', () => {
    it('should validate a correct Stellar signature', async () => {
      const dto = new TestStellarSignatureDto();
      // Valid base64 signature (88 characters for 64 bytes)
      dto.signature = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/' +
                      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/' +
                      'AB==';
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject an invalid signature (too short)', async () => {
      const dto = new TestStellarSignatureDto();
      dto.signature = 'ABC';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject a non-string value', async () => {
      const dto = new TestStellarSignatureDto();
      dto.signature = 123 as any;
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsValidTimezone', () => {
    it('should validate a correct IANA timezone', async () => {
      const dto = new TestTimezoneDto();
      dto.timezone = 'America/New_York';
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate another correct IANA timezone', async () => {
      const dto = new TestTimezoneDto();
      dto.timezone = 'Europe/London';
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject an invalid timezone', async () => {
      const dto = new TestTimezoneDto();
      dto.timezone = 'Invalid/Timezone';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject a non-string value', async () => {
      const dto = new TestTimezoneDto();
      dto.timezone = 123 as any;
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsAfterDate', () => {
    it('should validate when endDate is after startDate', async () => {
      const dto = new TestAfterDateDto();
      dto.startDate = '2024-01-01';
      dto.endDate = '2024-01-02';
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject when endDate is before startDate', async () => {
      const dto = new TestAfterDateDto();
      dto.startDate = '2024-01-02';
      dto.endDate = '2024-01-01';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject when endDate equals startDate', async () => {
      const dto = new TestAfterDateDto();
      dto.startDate = '2024-01-01';
      dto.endDate = '2024-01-01';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsTimeFormat', () => {
    it('should validate a correct time format (24-hour)', async () => {
      const dto = new TestTimeFormatDto();
      dto.time = '14:30';
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate midnight', async () => {
      const dto = new TestTimeFormatDto();
      dto.time = '00:00';
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate 23:59', async () => {
      const dto = new TestTimeFormatDto();
      dto.time = '23:59';
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid hour (24:00)', async () => {
      const dto = new TestTimeFormatDto();
      dto.time = '24:00';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid minute (14:60)', async () => {
      const dto = new TestTimeFormatDto();
      dto.time = '14:60';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject wrong format', async () => {
      const dto = new TestTimeFormatDto();
      dto.time = '2:30';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsDateFormat', () => {
    it('should validate a correct date format (YYYY-MM-DD)', async () => {
      const dto = new TestDateFormatDto();
      dto.date = '2024-01-15';
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject wrong format (MM/DD/YYYY)', async () => {
      const dto = new TestDateFormatDto();
      dto.date = '01/15/2024';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid date', async () => {
      const dto = new TestDateFormatDto();
      dto.date = '2024-13-01';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('IsISODate', () => {
    it('should validate a correct ISO date string', async () => {
      const dto = new TestISODateDto();
      dto.date = '2024-01-15T10:30:00Z';
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate another ISO date string', async () => {
      const dto = new TestISODateDto();
      dto.date = '2024-01-15T10:30:00.000Z';
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid date string', async () => {
      const dto = new TestISODateDto();
      dto.date = 'not-a-date';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
