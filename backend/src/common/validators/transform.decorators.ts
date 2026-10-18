import { Transform } from 'class-transformer';

/**
 * Normalises a query-string value to `string | undefined` (#1460).
 *
 * Without this, `?role=` arrives as `''` and passes `@IsOptional()`-style
 * checks as a real value, silently widening a query. Empty strings collapse to
 * `undefined` so "absent" and "present but blank" behave identically.
 */
export const EmptyStringToUndefined = (): PropertyDecorator =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });

/** Trims strings and lower-cases them, for case-insensitive filters (#1460). */
export const TrimmedLowercase = (): PropertyDecorator =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

/** Trims strings, leaving non-strings untouched (#1460). */
export const Trim = (): PropertyDecorator =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));