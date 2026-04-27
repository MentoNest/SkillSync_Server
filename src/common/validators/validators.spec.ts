import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IsString } from 'class-validator';
import { IsStellarAddress } from './is-stellar-address.validator';
import { IsAfterDate } from './is-after-date.validator';
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { DateRangeQueryDto } from '../dto/date-range-query.dto';

// ─── IsStellarAddress ────────────────────────────────────────────────────────

class AddressDto {
  @IsStellarAddress()
  address: string;
}

describe('IsStellarAddress', () => {
  const valid = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

  it('accepts a valid G-address', async () => {
    const dto = plainToInstance(AddressDto, { address: valid });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an address shorter than 56 chars', async () => {
    const dto = plainToInstance(AddressDto, { address: 'GABC' });
    const errors = await validate(dto);
    expect(errors[0].constraints?.IsStellarAddress).toBeTruthy();
  });

  it('rejects a non-G/C prefix', async () => {
    const dto = plainToInstance(AddressDto, { address: valid.replace('G', 'X') });
    const errors = await validate(dto);
    expect(errors[0].constraints?.IsStellarAddress).toBeTruthy();
  });

  it('rejects a random string', async () => {
    const dto = plainToInstance(AddressDto, { address: 'not-an-address' });
    const errors = await validate(dto);
    expect(errors).not.toHaveLength(0);
  });
});

// ─── IsAfterDate ─────────────────────────────────────────────────────────────

describe('IsAfterDate', () => {
  it('passes when endDate is after startDate', async () => {
    const dto = plainToInstance(DateRangeQueryDto, {
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when endDate is before startDate', async () => {
    const dto = plainToInstance(DateRangeQueryDto, {
      startDate: '2025-12-31',
      endDate: '2025-01-01',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'endDate')).toBe(true);
  });

  it('passes when only startDate is provided', async () => {
    const dto = plainToInstance(DateRangeQueryDto, { startDate: '2025-01-01' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

// ─── PaginationQueryDto ───────────────────────────────────────────────────────

describe('PaginationQueryDto', () => {
  it('defaults page=1 limit=20', () => {
    const dto = plainToInstance(PaginationQueryDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('rejects limit > 100', async () => {
    const dto = plainToInstance(PaginationQueryDto, { limit: 999 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('rejects negative page', async () => {
    const dto = plainToInstance(PaginationQueryDto, { page: -1 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });
});
