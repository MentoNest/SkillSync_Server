import { PortfolioPlatform } from './portfolio-link.entity';

const PLATFORM_PATTERNS: Array<{ platform: PortfolioPlatform; hosts: RegExp[] }> = [
  { platform: PortfolioPlatform.GITHUB, hosts: [/^(www\.)?github\.com$/i] },
  { platform: PortfolioPlatform.LINKEDIN, hosts: [/^(www\.)?linkedin\.com$/i] },
  { platform: PortfolioPlatform.TWITTER, hosts: [/^(www\.)?(twitter|x)\.com$/i] },
  { platform: PortfolioPlatform.BEHANCE, hosts: [/^(www\.)?behance\.net$/i] },
  { platform: PortfolioPlatform.DRIBBBLE, hosts: [/^(www\.)?dribbble\.com$/i] },
  { platform: PortfolioPlatform.MEDIUM, hosts: [/^(www\.)?medium\.com$/i, /^.+\.medium\.com$/i] },
  { platform: PortfolioPlatform.DEVTO, hosts: [/^(www\.)?dev\.to$/i] },
  { platform: PortfolioPlatform.YOUTUBE, hosts: [/^(www\.)?(youtube\.com|youtu\.be)$/i] },
];

export function sanitizePortfolioUrl(raw: string): string {
  const trimmed = raw.trim();
  // Strip control chars and angle brackets to reduce XSS/log injection risk.
  const cleaned = trimmed.replace(/[<>"'`\x00-\x1F\x7F]/g, '');
  const parsed = new URL(cleaned);
  if (parsed.protocol !== 'https:') {
    throw new Error('Only https URLs are allowed.');
  }
  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';
  return parsed.toString();
}

export function detectPlatform(url: string): PortfolioPlatform {
  const host = new URL(url).hostname.toLowerCase();
  for (const entry of PLATFORM_PATTERNS) {
    if (entry.hosts.some((re) => re.test(host))) return entry.platform;
  }
  return PortfolioPlatform.PERSONAL_WEBSITE;
}

export function isSupportedPlatformUrl(platform: PortfolioPlatform, url: string): boolean {
  if (platform === PortfolioPlatform.PERSONAL_WEBSITE) return true;
  return detectPlatform(url) === platform;
}

export async function verifyOwnershipIfConfigured(
  url: string,
  walletAddress: string,
  enabled: boolean,
): Promise<boolean> {
  if (!enabled) return true;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const html = await res.text();
    return html.includes(walletAddress) || html.toLowerCase().includes('skillsync-ownership');
  } catch {
    return false;
  }
}
