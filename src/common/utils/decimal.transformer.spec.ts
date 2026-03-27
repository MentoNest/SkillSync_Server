import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateServiceListingDto } from '../../modules/service-listing/dto/create-service-listing.dto';
import { CurrencyCode } from '../../common/enums/currency-code.enum';
import { decimalTransformer } from './decimal.transformer';

describe('Currency and Decimal Support', () => {
  it('accepts a supported currency code', async () => {
    const dto = new CreateServiceListingDto();
    dto.currency = CurrencyCode.EUR;

    const errors = await validate(dto, { skipMissingProperties: true });

    expect(errors.length).toBe(0);
  });

  it('rejects an unsupported currency code', async () => {
    const dto: any = new CreateServiceListingDto();
    dto.currency = 'ABC';

    const errors = await validate(dto, { skipMissingProperties: true });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].constraints).toHaveProperty('isEnum');
  });

  it('normalizes lowercase currency code input to uppercase', async () => {
    const dto = plainToInstance(CreateServiceListingDto, { currency: 'usd' });
    const errors = await validate(dto, { skipMissingProperties: true });

    expect(errors.length).toBe(0);
    expect(dto.currency).toBe(CurrencyCode.USD);
  });

  it('converts decimal strings to numbers with the transformer', () => {
    expect(decimalTransformer.from('123.45')).toBe(123.45);
    expect(decimalTransformer.from('0.00')).toBe(0);
    expect(decimalTransformer.to(123.45)).toBe(123.45);
  });
});
