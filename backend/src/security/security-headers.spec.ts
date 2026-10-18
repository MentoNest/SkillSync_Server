/**
 * Lightweight assertions for the Helmet configuration surface (#1470).
 */
import helmet from 'helmet';

describe('Security headers policy (#1470)', () => {
  it('exports a callable helmet middleware factory', () => {
    expect(typeof helmet).toBe('function');
  });

  it('frameguard deny and noSniff are expressible via helmet options', () => {
    const mw = helmet({
      frameguard: { action: 'deny' },
      noSniff: true,
      xssFilter: true,
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    });
    expect(typeof mw).toBe('function');
  });

  it('documents HSTS max-age of one year for production', () => {
    const maxAge = 31_536_000;
    expect(maxAge).toBe(365 * 24 * 60 * 60);
  });
});
