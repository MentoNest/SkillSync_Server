import {
  validateUsername,
  UsernameValidationError,
} from '../username.validator';

function expectValid(username: string) {
  const result = validateUsername(username);
  expect(result.valid).toBe(true);
  expect(result.error).toBeUndefined();
}

function expectInvalid(username: string, error: UsernameValidationError) {
  const result = validateUsername(username);
  expect(result.valid).toBe(false);
  expect(result.error).toBe(error);
  expect(result.message).toBeTruthy();
}

describe('validateUsername', () => {
  describe('valid usernames', () => {
    it('accepts a simple alphanumeric username', () => expectValid('alice'));
    it('accepts the minimum 3-character username', () => expectValid('abc'));
    it('accepts the maximum 30-character username', () =>
      expectValid('a'.repeat(28) + 'bc'));
    it('accepts underscores between letters', () => expectValid('alice_dev'));
    it('accepts dashes between letters', () => expectValid('alice-dev'));
    it('accepts mixed letters, digits, underscores, and dashes', () =>
      expectValid('Alice_Dev-42'));
    it('accepts uppercase letters', () => expectValid('AliceDev'));
    it('accepts a username that starts and ends with a digit', () =>
      expectValid('1alice1'));
    it('accepts a single special character between alphanumerics', () =>
      expectValid('a_b'));
    it('accepts alternating specials: a-b_c', () => expectValid('a-b_c'));
  });

  describe('length violations', () => {
    it('rejects a 2-character username', () =>
      expectInvalid('ab', 'TOO_SHORT'));
    it('rejects a 1-character username', () => expectInvalid('a', 'TOO_SHORT'));
    it('rejects an empty string', () => expectInvalid('', 'TOO_SHORT'));
    it('rejects a 31-character username', () =>
      expectInvalid('a'.repeat(31), 'TOO_LONG'));
    it('rejects a 50-character username', () =>
      expectInvalid('a'.repeat(50), 'TOO_LONG'));
  });

  describe('invalid characters', () => {
    it('rejects spaces', () => expectInvalid('alice dev', 'INVALID_CHARS'));
    it('rejects dots', () => expectInvalid('alice.dev', 'INVALID_CHARS'));
    it('rejects at-signs', () => expectInvalid('alice@dev', 'INVALID_CHARS'));
    it('rejects unicode letters', () =>
      expectInvalid('aliçe', 'INVALID_CHARS'));
    it('rejects exclamation marks', () =>
      expectInvalid('alice!', 'INVALID_CHARS'));
  });

  describe('start/end with special character', () => {
    it('rejects usernames starting with underscore', () =>
      expectInvalid('_alice', 'STARTS_WITH_SPECIAL'));
    it('rejects usernames starting with dash', () =>
      expectInvalid('-alice', 'STARTS_WITH_SPECIAL'));
    it('rejects usernames ending with underscore', () =>
      expectInvalid('alice_', 'ENDS_WITH_SPECIAL'));
    it('rejects usernames ending with dash', () =>
      expectInvalid('alice-', 'ENDS_WITH_SPECIAL'));
  });

  describe('consecutive special characters', () => {
    it('rejects double underscore', () =>
      expectInvalid('alice__dev', 'CONSECUTIVE_SPECIAL'));
    it('rejects double dash', () =>
      expectInvalid('alice--dev', 'CONSECUTIVE_SPECIAL'));
    it('rejects underscore-dash sequence', () =>
      expectInvalid('alice_-dev', 'CONSECUTIVE_SPECIAL'));
    it('rejects dash-underscore sequence', () =>
      expectInvalid('alice-_dev', 'CONSECUTIVE_SPECIAL'));
    it('rejects three consecutive specials', () =>
      expectInvalid('a___b', 'CONSECUTIVE_SPECIAL'));
  });
});
