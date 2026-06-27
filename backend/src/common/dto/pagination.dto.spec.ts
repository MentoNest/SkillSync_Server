import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationDto } from './pagination.dto';

function make(overrides?: Record<string, unknown>) {
  return plainToInstance(PaginationDto, { ...overrides });
}

describe('PaginationDto', () => {
  it('uses defaults when no values provided', () => {
    const dto = make();
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('passes with valid page and limit', async () => {
    expect(await validate(make({ page: 2, limit: 50 }))).toHaveLength(0);
  });

  it('transforms string numbers to integers via @Type', async () => {
    const dto = make({ page: '3', limit: '25' });
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(25);
  });

  it('fails when page is 0', async () => {
    const errors = await validate(make({ page: 0 }));
    expect(errors.find((e) => e.property === 'page')).toBeDefined();
  });

  it('fails when page is negative', async () => {
    const errors = await validate(make({ page: -1 }));
    expect(errors.find((e) => e.property === 'page')).toBeDefined();
  });

  it('fails when limit exceeds 100', async () => {
    const errors = await validate(make({ limit: 101 }));
    expect(errors.find((e) => e.property === 'limit')).toBeDefined();
  });

  it('passes with limit of exactly 100', async () => {
    expect(await validate(make({ limit: 100 }))).toHaveLength(0);
  });

  it('fails when page is a float', async () => {
    const errors = await validate(make({ page: 1.5 }));
    expect(errors.find((e) => e.property === 'page')).toBeDefined();
  });
});
