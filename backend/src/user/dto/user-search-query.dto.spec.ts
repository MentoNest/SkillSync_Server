/**
 * #1340: user search - filter combinations, sorting and pagination edges.
 *
 * `UserSearchQueryDto` is the whole contract for `GET /users`, so the DTO is
 * validated directly with class-validator. Query strings arrive as strings, so
 * the tests also run values through `plainToInstance` + `plainToInstance`
 * round-trips to cover the `Type(() => Number)` coercion that page and limit
 * rely on. Defaults matter here: a caller who omits `sortBy` must get a stable
 * ordering rather than an arbitrary one.
 */
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  USER_SEARCH_ROLES,
  USER_SORT_FIELDS,
  USER_SORT_ORDERS,
  UserSearchQueryDto,
} from './user-search-query.dto.js';

/** Build a DTO from a raw query-string style payload and validate it. */
async function validateQuery(payload: Record<string, unknown>) {
  const dto = plainToInstance(UserSearchQueryDto, payload);
  const errors = await validate(dto);
  return { dto, errors };
}

/** Property names that failed validation, for concise assertions. */
function failedProperties(
  errors: Awaited<ReturnType<typeof validate>>,
): string[] {
  return errors.map((error) => error.property);
}

describe('UserSearchQueryDto defaults', () => {
  it('applies the documented defaults for an empty query', async () => {
    const { dto, errors } = await validateQuery({});

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.sortBy).toBe('createdAt');
    expect(dto.sortOrder).toBe('desc');
  });

  it('leaves the filter properties undefined when they are omitted', async () => {
    const { dto } = await validateQuery({});

    expect(dto.role).toBeUndefined();
    expect(dto.search).toBeUndefined();
    expect(dto.skill).toBeUndefined();
  });
});

describe('UserSearchQueryDto role filter', () => {
  it.each(USER_SEARCH_ROLES)('accepts role %s', async (role) => {
    const { errors } = await validateQuery({ role });

    expect(errors).toHaveLength(0);
  });

  it('rejects an unknown role', async () => {
    const { errors } = await validateQuery({ role: 'superuser' });

    expect(failedProperties(errors)).toContain('role');
  });

  it('rejects a role with the wrong case', async () => {
    const { errors } = await validateQuery({ role: 'Mentor' });

    expect(failedProperties(errors)).toContain('role');
  });
});

describe('UserSearchQueryDto free-text filters', () => {
  it('accepts a short search term', async () => {
    const { errors } = await validateQuery({ search: 'Alex' });

    expect(errors).toHaveLength(0);
  });

  it('accepts an empty search term, which a UI sends for an untouched box', async () => {
    const { errors } = await validateQuery({ search: '' });

    expect(errors).toHaveLength(0);
  });

  it('accepts a search term at the 100-character limit', async () => {
    const { errors } = await validateQuery({ search: 'a'.repeat(100) });

    expect(errors).toHaveLength(0);
  });

  it('rejects a search term over 100 characters', async () => {
    const { errors } = await validateQuery({ search: 'a'.repeat(101) });

    expect(failedProperties(errors)).toContain('search');
  });

  it('applies the same length rule to the skill filter', async () => {
    const accepted = await validateQuery({ skill: 'Solidity' });
    const rejected = await validateQuery({ skill: 's'.repeat(101) });

    expect(accepted.errors).toHaveLength(0);
    expect(failedProperties(rejected.errors)).toContain('skill');
  });

  it('does not treat SQL metacharacters as a validation failure', async () => {
    // Injection is the database's job (parameterized queries); the DTO only
    // guards the shape of the input.
    const { errors } = await validateQuery({
      search: "'; DROP TABLE users; --",
    });

    expect(errors).toHaveLength(0);
  });
});

describe('UserSearchQueryDto sorting', () => {
  it.each(USER_SORT_FIELDS)('accepts sortBy %s', async (sortBy) => {
    const { errors } = await validateQuery({ sortBy });

    expect(errors).toHaveLength(0);
  });

  it.each(USER_SORT_ORDERS)('accepts sortOrder %s', async (sortOrder) => {
    const { errors } = await validateQuery({ sortOrder });

    expect(errors).toHaveLength(0);
  });

  it('rejects a sortBy that is not a whitelisted column', async () => {
    const { errors } = await validateQuery({ sortBy: 'email' });

    expect(failedProperties(errors)).toContain('sortBy');
  });

  it('rejects an unknown sortOrder', async () => {
    const { errors } = await validateQuery({ sortOrder: 'ascending' });

    expect(failedProperties(errors)).toContain('sortOrder');
  });

  it('rejects an uppercase sortOrder, since the enum is lowercase', async () => {
    const { errors } = await validateQuery({ sortOrder: 'ASC' });

    expect(failedProperties(errors)).toContain('sortOrder');
  });
});

describe('UserSearchQueryDto pagination', () => {
  it('coerces string page and limit from the query string into numbers', async () => {
    const { dto, errors } = await validateQuery({ page: '3', limit: '50' });

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(50);
  });

  it.each([1, 2, 1000])('accepts page %i', async (page) => {
    const { errors } = await validateQuery({ page });

    expect(errors).toHaveLength(0);
  });

  it.each([0, -1])('rejects page %i', async (page) => {
    const { errors } = await validateQuery({ page });

    expect(failedProperties(errors)).toContain('page');
  });

  it('rejects a non-integer page', async () => {
    const { errors } = await validateQuery({ page: '1.5' });

    expect(failedProperties(errors)).toContain('page');
  });

  it('rejects a non-numeric page', async () => {
    const { errors } = await validateQuery({ page: 'abc' });

    expect(failedProperties(errors)).toContain('page');
  });

  it('accepts limit at both ends of the allowed range', async () => {
    const minimum = await validateQuery({ limit: 1 });
    const maximum = await validateQuery({ limit: 100 });

    expect(minimum.errors).toHaveLength(0);
    expect(maximum.errors).toHaveLength(0);
  });

  it('rejects limit 0, which would produce an empty page forever', async () => {
    const { errors } = await validateQuery({ limit: 0 });

    expect(failedProperties(errors)).toContain('limit');
  });

  it('rejects limit 101, one past the documented maximum', async () => {
    const { errors } = await validateQuery({ limit: 101 });

    expect(failedProperties(errors)).toContain('limit');
  });
});

describe('UserSearchQueryDto filter combinations', () => {
  it('accepts every filter supplied together', async () => {
    const { dto, errors } = await validateQuery({
      role: 'mentor',
      search: 'Alex',
      skill: 'Solidity',
      sortBy: 'rating',
      sortOrder: 'asc',
      page: '2',
      limit: '25',
    });

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({
      role: 'mentor',
      search: 'Alex',
      skill: 'Solidity',
      sortBy: 'rating',
      sortOrder: 'asc',
      page: 2,
      limit: 25,
    });
  });

  it('accepts a role filter on its own', async () => {
    const { errors } = await validateQuery({ role: 'mentee' });

    expect(errors).toHaveLength(0);
  });

  it('accepts a skill filter combined with sorting but no text', async () => {
    const { errors } = await validateQuery({
      skill: 'Rust',
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(errors).toHaveLength(0);
  });

  it('reports every invalid property at once rather than only the first', async () => {
    const { errors } = await validateQuery({
      role: 'wizard',
      sortBy: 'password',
      page: '0',
    });

    expect(errors).toHaveLength(3);
    expect(failedProperties(errors)).toEqual(
      expect.arrayContaining(['role', 'sortBy', 'page']),
    );
  });

  it('still applies defaults for the filters a caller left out', async () => {
    const { dto } = await validateQuery({ role: 'mentor' });

    expect(dto.sortBy).toBe('createdAt');
    expect(dto.sortOrder).toBe('desc');
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });
});

describe('UserSearchQueryDto whitelist constants', () => {
  it('exposes the allowed values used by both the validator and the docs', () => {
    expect([...USER_SEARCH_ROLES]).toEqual(['mentor', 'mentee', 'admin']);
    expect([...USER_SORT_FIELDS]).toEqual(['name', 'createdAt', 'rating']);
    expect([...USER_SORT_ORDERS]).toEqual(['asc', 'desc']);
  });

  it('does not allow an internal column such as passwordHash to be sorted on', () => {
    expect([...USER_SORT_FIELDS]).not.toContain('passwordHash');
    expect([...USER_SORT_FIELDS]).not.toContain('email');
  });
});
