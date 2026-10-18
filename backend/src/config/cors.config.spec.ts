import { isOriginAllowed, resolveAllowedOrigins } from './cors.config';

describe('CORS origin validation (#1471)', () => {
  it('includes localhost defaults outside production', () => {
    const allowed = resolveAllowedOrigins('https://app.skillsync.test', 'development');
    expect(allowed).toContain('https://app.skillsync.test');
    expect(allowed).toContain('http://localhost:3000');
  });

  it('uses only env origins in production', () => {
    const allowed = resolveAllowedOrigins(
      'https://app.skillsync.test,https://staging.skillsync.test',
      'production',
    );
    expect(allowed).toEqual([
      'https://app.skillsync.test',
      'https://staging.skillsync.test',
    ]);
  });

  it('allows missing Origin (non-browser clients)', () => {
    expect(isOriginAllowed(undefined, ['https://app.skillsync.test'])).toBe(true);
  });

  it('rejects unlisted origins', () => {
    expect(isOriginAllowed('https://evil.example', ['https://app.skillsync.test'])).toBe(
      false,
    );
  });
});
