import { isValidUsername } from './username.validator';

describe('isValidUsername', () => {
  it('should accept valid usernames with alphanumeric characters', () => {
    expect(isValidUsername('john123')).toBe(true);
    expect(isValidUsername('JohnDoe')).toBe(true);
    expect(isValidUsername('user42')).toBe(true);
  });

  it('should accept valid usernames with underscores', () => {
    expect(isValidUsername('john_doe')).toBe(true);
    expect(isValidUsername('user_name')).toBe(true);
    expect(isValidUsername('test_user_123')).toBe(true);
  });

  it('should accept valid usernames with dashes', () => {
    expect(isValidUsername('john-doe')).toBe(true);
    expect(isValidUsername('user-name')).toBe(true);
    expect(isValidUsername('test-user-123')).toBe(true);
  });

  it('should accept usernames with mixed special characters', () => {
    expect(isValidUsername('john_doe-123')).toBe(true);
    expect(isValidUsername('user-name_test')).toBe(true);
  });

  it('should reject usernames shorter than 3 characters', () => {
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('a')).toBe(false);
    expect(isValidUsername('')).toBe(false);
  });

  it('should reject usernames longer than 30 characters', () => {
    expect(isValidUsername('a'.repeat(31))).toBe(false);
    expect(isValidUsername('verylongusernamethatexceedsthirt')).toBe(false);
  });

  it('should reject usernames with consecutive underscores', () => {
    expect(isValidUsername('john__doe')).toBe(false);
    expect(isValidUsername('user___name')).toBe(false);
  });

  it('should reject usernames with consecutive dashes', () => {
    expect(isValidUsername('john--doe')).toBe(false);
    expect(isValidUsername('user---name')).toBe(false);
  });

  it('should reject usernames with mixed consecutive special characters', () => {
    expect(isValidUsername('john_-doe')).toBe(false);
    expect(isValidUsername('user-_name')).toBe(false);
  });

  it('should reject usernames starting with underscore', () => {
    expect(isValidUsername('_john')).toBe(false);
    expect(isValidUsername('_username')).toBe(false);
  });

  it('should reject usernames starting with dash', () => {
    expect(isValidUsername('-john')).toBe(false);
    expect(isValidUsername('-username')).toBe(false);
  });

  it('should reject usernames ending with underscore', () => {
    expect(isValidUsername('john_')).toBe(false);
    expect(isValidUsername('username_')).toBe(false);
  });

  it('should reject usernames ending with dash', () => {
    expect(isValidUsername('john-')).toBe(false);
    expect(isValidUsername('username-')).toBe(false);
  });

  it('should reject usernames with invalid characters', () => {
    expect(isValidUsername('john@doe')).toBe(false);
    expect(isValidUsername('john.doe')).toBe(false);
    expect(isValidUsername('john doe')).toBe(false);
    expect(isValidUsername('john!')).toBe(false);
  });

  it('should reject non-string values', () => {
    expect(isValidUsername(null as any)).toBe(false);
    expect(isValidUsername(undefined as any)).toBe(false);
    expect(isValidUsername(123 as any)).toBe(false);
    expect(isValidUsername({} as any)).toBe(false);
  });

  it('should accept exactly 3 character usernames', () => {
    expect(isValidUsername('abc')).toBe(true);
    expect(isValidUsername('a1_')).toBe(false); // ends with special char
    expect(isValidUsername('a-1')).toBe(true);
  });

  it('should accept exactly 30 character usernames', () => {
    expect(isValidUsername('a'.repeat(30))).toBe(true);
    expect(isValidUsername('user_name_123456789012345')).toBe(true);
  });
});
