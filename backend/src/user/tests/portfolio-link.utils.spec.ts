import { PortfolioPlatform } from '../portfolio-link.entity';
import { detectPlatform, isSupportedPlatformUrl, sanitizePortfolioUrl } from '../portfolio-link.utils';

describe('portfolio-link.utils', () => {
  it('accepts valid https urls and sanitizes', () => {
    expect(sanitizePortfolioUrl(' https://github.com/alice ')).toBe('https://github.com/alice');
  });

  it('rejects non-https urls', () => {
    expect(() => sanitizePortfolioUrl('http://github.com/alice')).toThrow(/https/i);
  });

  it('detects platform from URL', () => {
    expect(detectPlatform('https://github.com/alice')).toBe(PortfolioPlatform.GITHUB);
    expect(detectPlatform('https://x.com/alice')).toBe(PortfolioPlatform.TWITTER);
    expect(detectPlatform('https://example.com/me')).toBe(PortfolioPlatform.PERSONAL_WEBSITE);
  });

  it('validates platform/url match', () => {
    expect(isSupportedPlatformUrl(PortfolioPlatform.GITHUB, 'https://github.com/alice')).toBe(true);
    expect(isSupportedPlatformUrl(PortfolioPlatform.GITHUB, 'https://linkedin.com/in/alice')).toBe(false);
  });
});
