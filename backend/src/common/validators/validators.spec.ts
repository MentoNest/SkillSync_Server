import { Type, plainToInstance } from 'class-transformer';
import {
  IsOptional,
  IsString,
  ValidateNested,
  validate,
} from 'class-validator';
import { AvailabilityCheckQueryDto, UserIdParamDto } from '../dto/base.dto';
import { IsAvailabilityWindow } from './availability-window.validator';
import { IsAfterDate, IsIsoDateTime } from './date.validators';
import { IsIanaTimezone } from './timezone.validator';
import { isValidStellarWalletAddress } from './wallet-address';

const WALLET = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';

describe('common validators (#1692)', () => {
  it('accepts Stellar public keys and rejects malformed addresses', () => {
    expect(isValidStellarWalletAddress(WALLET)).toBe(true);
    expect(isValidStellarWalletAddress(WALLET.slice(0, 55))).toBe(false);
    expect(isValidStellarWalletAddress(`S${WALLET.slice(1)}`)).toBe(false);
    expect(isValidStellarWalletAddress(`${WALLET.slice(0, 55)}0`)).toBe(false);
    expect(isValidStellarWalletAddress(123)).toBe(false);
  });

  it('validates wallet params through class-validator', async () => {
    const good = plainToInstance(UserIdParamDto, { userId: WALLET });
    const bad = plainToInstance(UserIdParamDto, { userId: 'not-a-wallet' });

    expect(await validate(good)).toHaveLength(0);
    expect((await validate(bad)).map((error) => error.property)).toContain(
      'userId',
    );
  });

  it('accepts ISO 8601 date-times with timezones only', async () => {
    class Dto {
      @IsIsoDateTime()
      dateTime!: string;
    }

    expect(
      await validate(
        plainToInstance(Dto, { dateTime: '2026-11-23T10:30:00.000Z' }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(Dto, { dateTime: '2026-11-23T10:30:00' })),
    ).toHaveLength(1);
  });

  it('enforces date ordering across fields', async () => {
    class Dto {
      @IsIsoDateTime()
      from!: string;
      @IsAfterDate('from')
      to!: string;
    }

    expect(
      await validate(
        plainToInstance(Dto, {
          from: '2026-01-01T00:00:00Z',
          to: '2026-02-01T00:00:00Z',
        }),
      ),
    ).toHaveLength(0);
    const errors = await validate(
      plainToInstance(Dto, {
        from: '2026-03-01T00:00:00Z',
        to: '2026-02-01T00:00:00Z',
      }),
    );
    expect(errors.map((error) => error.property)).toContain('to');
  });

  it('validates IANA timezones', async () => {
    class Dto {
      @IsIanaTimezone()
      timezone!: string;
    }

    expect(
      await validate(plainToInstance(Dto, { timezone: 'Africa/Lagos' })),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(Dto, { timezone: 'UTC' })),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(Dto, { timezone: 'Mars/Olympus' })),
    ).toHaveLength(1);
  });

  it('validates availability windows', async () => {
    class Dto {
      @IsString()
      startTimeUtc!: string;
      @IsAvailabilityWindow('startTimeUtc')
      endTimeUtc!: string;
    }

    expect(
      await validate(
        plainToInstance(Dto, { startTimeUtc: '10:00', endTimeUtc: '12:00' }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(Dto, { startTimeUtc: '12:00', endTimeUtc: '10:00' }),
      ),
    ).toHaveLength(1);
  });

  it('validates nested objects with @ValidateNested and @Type', async () => {
    class NestedDto {
      @IsString()
      label!: string;
    }
    class ParentDto {
      @IsOptional()
      @ValidateNested()
      @Type(() => NestedDto)
      nested!: NestedDto;
    }

    expect(
      await validate(plainToInstance(ParentDto, { nested: { label: 'ok' } })),
    ).toHaveLength(0);
    const errors = await validate(
      plainToInstance(ParentDto, { nested: { label: 42 } }),
    );
    expect(errors[0].children?.map((child) => child.property)).toContain(
      'label',
    );
  });

  it('exposes the availability check query DTO with its custom rules', async () => {
    const good = plainToInstance(AvailabilityCheckQueryDto, {
      dateTime: '2026-11-23T10:30:00.000Z',
    });
    const bad = plainToInstance(AvailabilityCheckQueryDto, {
      dateTime: 'yesterday',
    });
    expect(await validate(good)).toHaveLength(0);
    expect(await validate(bad)).toHaveLength(1);
  });
});
