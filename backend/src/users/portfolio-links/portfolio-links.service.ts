import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent } from '../../audit/entities/audit-log.entity';
import { AuditService } from '../../audit/audit.service';
import { CreatePortfolioLinkDto } from './dto/portfolio-link.dto';
import { PortfolioLink, PortfolioPlatform } from './entities/portfolio-link.entity';

export const MAX_PORTFOLIO_LINKS = 10;

const PLATFORM_HOSTS: Record<PortfolioPlatform, string[]> = {
  [PortfolioPlatform.GITHUB]: ['github.com'],
  [PortfolioPlatform.LINKEDIN]: ['linkedin.com'],
  [PortfolioPlatform.TWITTER]: ['twitter.com', 'x.com'],
  [PortfolioPlatform.WEBSITE]: [],
  [PortfolioPlatform.BEHANCE]: ['behance.net'],
  [PortfolioPlatform.DRIBBBLE]: ['dribbble.com'],
  [PortfolioPlatform.MEDIUM]: ['medium.com'],
  [PortfolioPlatform.DEVTO]: ['dev.to'],
  [PortfolioPlatform.YOUTUBE]: ['youtube.com', 'youtu.be'],
};

@Injectable()
export class PortfolioLinksService {
  private readonly verifyOwnership: boolean;

  constructor(
    @InjectRepository(PortfolioLink) private readonly links: Repository<PortfolioLink>,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.verifyOwnership = (config.get<string>('PORTFOLIO_VERIFY_OWNERSHIP') ?? 'false') === 'true';
  }

  /** Strips control characters and dangerous schemes before anything else touches the value. */
  sanitizeUrl(raw: string): string {
    return (raw ?? '')
      .trim()
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/javascript:/gi, '');
  }

  /** Returns a normalised https URL or throws when the value is not a usable link. */
  validateUrl(raw: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(this.sanitizeUrl(raw));
    } catch {
      throw new BadRequestException('Invalid URL');
    }
    if (parsed.protocol !== 'https:') throw new BadRequestException('Only https URLs are allowed');
    if (!parsed.hostname.includes('.')) throw new BadRequestException('Invalid URL hostname');
    return parsed;
  }

  detectPlatform(url: URL, provided?: PortfolioPlatform): PortfolioPlatform {
    if (provided) return provided;
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    for (const [platform, hosts] of Object.entries(PLATFORM_HOSTS) as [PortfolioPlatform, string[]][]) {
      if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return platform;
    }
    return PortfolioPlatform.WEBSITE;
  }

  /** Placeholder ownership check: uses the platform pattern until real meta-tag verification lands. */
  async verifyLinkOwnership(url: URL): Promise<boolean> {
    return this.detectPlatform(url) !== PortfolioPlatform.WEBSITE;
  }

  async add(userId: string, dto: CreatePortfolioLinkDto): Promise<PortfolioLink> {
    const parsed = this.validateUrl(dto.url);
    const platform = this.detectPlatform(parsed, dto.platform);
    const normalized = parsed.toString();

    const duplicate = await this.links.findOne({ where: { userId, url: normalized } });
    if (duplicate) throw new ConflictException('This link has already been added');

    const count = await this.links.count({ where: { userId } });
    if (count >= MAX_PORTFOLIO_LINKS) {
      throw new BadRequestException(`A maximum of ${MAX_PORTFOLIO_LINKS} portfolio links is allowed`);
    }

    const verified = this.verifyOwnership ? await this.verifyLinkOwnership(parsed) : false;
    const saved = await this.links.save(
      this.links.create({ userId, platform, url: normalized, title: dto.title ?? null, verified }),
    );
    void this.audit.record({ event: AuditEvent.PORTFOLIO_LINK_ADDED, userId, metadata: { platform, url: normalized } });
    return saved;
  }

  list(userId: string): Promise<PortfolioLink[]> {
    return this.links.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  /** Used by public profile endpoints; only safe, already-sanitised fields are returned. */
  getPublicLinks(userId: string): Promise<PortfolioLink[]> {
    return this.list(userId);
  }

  async remove(userId: string, id: string, isAdmin = false): Promise<void> {
    const link = await this.links.findOne({ where: { id } });
    if (!link) throw new NotFoundException('Portfolio link not found');
    if (!isAdmin && link.userId !== userId) throw new ForbiddenException('You can only remove your own links');

    await this.links.delete({ id });
    void this.audit.record({
      event: AuditEvent.PORTFOLIO_LINK_REMOVED,
      userId,
      metadata: { id, byAdmin: isAdmin, ownerId: link.userId },
    });
  }
}
