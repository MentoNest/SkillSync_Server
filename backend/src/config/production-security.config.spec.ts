import {
  getAuthCookieOptions,
  getEncryptionKey,
  getJwtSecret,
  getSearchHashSalt,
  parseTrustProxy,
} from './production-security.config.js';

describe('production security configuration', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalSearchHashSalt = process.env.SEARCH_HASH_SALT;
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
    if (originalSearchHashSalt === undefined) delete process.env.SEARCH_HASH_SALT;
    else process.env.SEARCH_HASH_SALT = originalSearchHashSalt;
    if (originalEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = originalEncryptionKey;
  });

  it('uses configured JWT and search-hash secrets', () => {
    process.env.JWT_SECRET = 'a-configured-test-secret';
    process.env.SEARCH_HASH_SALT = 'a-configured-search-salt';
    expect(getJwtSecret()).toBe('a-configured-test-secret');
    expect(getSearchHashSalt()).toBe('a-configured-search-salt');
  });

  it('fails closed when production JWT or search-hash secrets are absent', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    delete process.env.SEARCH_HASH_SALT;
    expect(() => getJwtSecret()).toThrow('JWT_SECRET');
    expect(() => getSearchHashSalt()).toThrow('SEARCH_HASH_SALT');
    expect(() => getEncryptionKey()).toThrow('ENCRYPTION_KEY');
  });

  it('rejects malformed encryption keys', () => {
    process.env.ENCRYPTION_KEY = 'not-hex';
    expect(() => getEncryptionKey()).toThrow('64 hexadecimal characters');
  });

  it('parses explicit proxy hop counts and networks without trusting all proxies', () => {
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy('loopback, 10.0.0.0/8')).toBe('loopback, 10.0.0.0/8');
    expect(parseTrustProxy('')).toBe(false);
    expect(() => parseTrustProxy('true')).toThrow('trusting all proxies is unsafe');
    expect(() => parseTrustProxy('0.0.0.0/0')).toThrow('trusting all proxies is unsafe');
  });

  it('sets secure, HTTP-only, strict same-site cookie attributes in production', () => {
    expect(getAuthCookieOptions('production')).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'strict',
    });
  });
});