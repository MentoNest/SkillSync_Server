import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationQueryDto } from '../pagination/dto/pagination-query.dto';
import { IsValidWalletAddress } from './is-valid-wallet-address.validator';
import { IsAfterDate, IsAfterProperty, IsTimeString } from './date-and-time.validators';
import { EmptyStringToUndefined, Trim } from './transform.decorators';

class WalletDto {
  @IsValidWalletAddress()
  walletAddress!: string;
}

class BookingDto {
  @IsAfterDate()
  startsAt!: string;

  @IsAfterProperty('startsAt')
  endsAt!: string;
}

class SlotDto {
  @IsTimeString()
  startTime!: string;

  @IsTimeString()
  endTime!: string;
}

class FilterDto {
  @EmptyStringToUndefined()
  @Trim()
  role?: string;
}

const G = 'G' + 'A'.repeat(55);

async function errorsFor(cls: new () => object, payload: object): Promise<string[]> {
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance as object, { whitelist: true, forbidNonWhitelisted: true });
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('#1460 custom validators', () => {
  describe('IsValidWalletAddress', () => {
    it('accepts a well-formed Stellar address', async () => {
      await expect(errorsFor(WalletDto, { walletAddress: G })).resolves.toEqual([]);
    });

    it('accepts a lowercase address', async () => {
      await expect(errorsFor(WalletDto, { walletAddress: G.toLowerCase() })).resolves.toEqual([]);
    });

    it('rejects a non-Stellar string', async () => {
      const errors = await errorsFor(WalletDto, { walletAddress: 'not-a-wallet' });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('must be a valid Stellar wallet address');
    });

    it('rejects a secret key', async () => {
      await expect(errorsFor(WalletDto, { walletAddress: 'S' + 'B'.repeat(55) })).resolves.not.toEqual([]);
    });

    it('rejects a non-string value', async () => {
      await expect(errorsFor(WalletDto, { walletAddress: 12345 })).resolves.not.toEqual([]);
    });

    it('reports a missing property rather than passing it through', async () => {
      await expect(errorsFor(WalletDto, {})).resolves.not.toEqual([]);
    });

    it('includes the property name in the message', async () => {
      const [message] = await errorsFor(WalletDto, { walletAddress: 'x' });
      expect(message).toMatch(/^walletAddress/);
    });
  });

  describe('IsAfterDate', () => {
    it('accepts a future date', async () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      await expect(errorsFor(BookingDto, { startsAt: future, endsAt: future })).resolves.toEqual([]);
    });

    it('rejects a past date', async () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      await expect(errorsFor(BookingDto, { startsAt: past, endsAt: past })).resolves.not.toEqual([]);
    });

    it('rejects an unparseable date', async () => {
      await expect(errorsFor(BookingDto, { startsAt: 'soon', endsAt: 'soon' })).resolves.not.toEqual([]);
    });
  });

  describe('IsAfterProperty', () => {
    it('accepts an end equal to the start', async () => {
      const t = new Date(Date.now() + 60_000).toISOString();
      await expect(errorsFor(BookingDto, { startsAt: t, endsAt: t })).resolves.toEqual([]);
    });

    it('rejects an end before the start', async () => {
      const start = new Date(Date.now() + 120_000).toISOString();
      const end = new Date(Date.now() + 60_000).toISOString();
      const errors = await errorsFor(BookingDto, { startsAt: start, endsAt: end });
      expect(errors.some((m) => m.includes('same as or later than startsAt'))).toBe(true);
    });

    it('rejects an unparseable comparison value', async () => {
      await expect(errorsFor(BookingDto, { startsAt: 'nope', endsAt: 'nope' })).resolves.not.toEqual([]);
    });
  });

  describe('IsTimeString', () => {
    it('accepts 24-hour HH:mm values', async () => {
      await expect(errorsFor(SlotDto, { startTime: '09:30', endTime: '17:00' })).resolves.toEqual([]);
      await expect(errorsFor(SlotDto, { startTime: '00:30', endTime: '23:59' })).resolves.toEqual([]);
    });

    it('rejects malformed, out-of-range and second-precision values', async () => {
      await expect(errorsFor(SlotDto, { startTime: '9:30', endTime: '17:00' })).resolves.not.toEqual([]);
      await expect(errorsFor(SlotDto, { startTime: '24:00', endTime: '17:00' })).resolves.not.toEqual([]);
      await expect(errorsFor(SlotDto, { startTime: '09:60', endTime: '17:00' })).resolves.not.toEqual([]);
      await expect(errorsFor(SlotDto, { startTime: '09:30:00', endTime: '17:00' })).resolves.not.toEqual([]);
    });

    it('rejects the degenerate midnight window', async () => {
      await expect(errorsFor(SlotDto, { startTime: '00:00', endTime: '17:00' })).resolves.not.toEqual([]);
    });
  });

  describe('transform helpers', () => {
    it('collapses an empty query string value to undefined', async () => {
      const instance = plainToInstance(FilterDto, { role: '' });
      expect(instance.role).toBeUndefined();
    });

    it('trims surrounding whitespace', () => {
      const instance = plainToInstance(FilterDto, { role: '  mentor  ' });
      expect(instance.role).toBe('mentor');
    });
  });

  describe('PaginationQueryDto', () => {
    it('accepts a valid page/limit pair', async () => {
      await expect(errorsFor(PaginationQueryDto, { page: 2, limit: 50 })).resolves.toEqual([]);
    });

    it('rejects a limit above the documented maximum', async () => {
      const errors = await errorsFor(PaginationQueryDto, { page: 1, limit: 101 });
      expect(errors[0]).toContain('limit must be less than or equal to 100');
    });

    it('rejects a zero or negative page', async () => {
      await expect(errorsFor(PaginationQueryDto, { page: 0 })).resolves.not.toEqual([]);
      await expect(errorsFor(PaginationQueryDto, { page: -1 })).resolves.not.toEqual([]);
    });

    it('coerces query-string values to numbers', () => {
      const instance = plainToInstance(PaginationQueryDto, { page: '3', limit: '25' });
      expect(instance.page).toBe(3);
      expect(instance.limit).toBe(25);
    });
  });
});