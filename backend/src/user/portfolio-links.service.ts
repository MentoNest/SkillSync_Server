import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BusinessRuleException,
  DuplicateResourceException,
  ResourceNotFoundException,
} from '../common/errors/app-exceptions';
import { CreatePortfolioLinkDto, PortfolioLinkResponseDto } from './dto/portfolio-link.dto';
import { PortfolioLink } from './portfolio-link.entity';
import {
  detectPlatform,
  isSupportedPlatformUrl,
  sanitizePortfolioUrl,
  verifyOwnershipIfConfigured,
} from './portfolio-link.utils';

const MAX_PORTFOLIO_LINKS = 10;

@Injectable()
export class PortfolioLinksService {
  constructor(
    @InjectRepository(PortfolioLink)
    private readonly links: Repository<PortfolioLink>,
    private readonly config: ConfigService,
  ) {}

  async listByWallet(walletAddress: string): Promise<PortfolioLinkResponseDto[]> {
    const rows = await this.links.find({ where: { walletAddress }, order: { createdAt: 'ASC' } });
    return rows.map((r) => this.toDto(r));
  }

  async create(walletAddress: string, dto: CreatePortfolioLinkDto): Promise<PortfolioLinkResponseDto> {
    let url: string;
    try {
      url = sanitizePortfolioUrl(dto.url);
    } catch (e) {
      throw new BusinessRuleException(e instanceof Error ? e.message : 'Invalid URL.');
    }

    const platform = dto.platform ?? detectPlatform(url);
    if (!isSupportedPlatformUrl(platform, url)) {
      throw new BusinessRuleException(`URL does not match selected platform "${platform}".`);
    }

    const count = await this.links.count({ where: { walletAddress } });
    if (count >= MAX_PORTFOLIO_LINKS) {
      throw new BusinessRuleException(`Maximum of ${MAX_PORTFOLIO_LINKS} portfolio links allowed.`);
    }

    const duplicate = await this.links.findOne({ where: { walletAddress, url } });
    if (duplicate) throw new DuplicateResourceException('Portfolio link URL already exists.');

    const verifyEnabled = (this.config.get<string>('PORTFOLIO_OWNERSHIP_VERIFICATION') ?? 'false') === 'true';
    const verified = await verifyOwnershipIfConfigured(url, walletAddress, verifyEnabled);
    if (!verified) throw new BusinessRuleException('Ownership verification failed for the provided URL.');

    const saved = await this.links.save(
      this.links.create({
        walletAddress,
        platform,
        url,
        displayTitle: dto.displayTitle?.trim() ? dto.displayTitle.trim() : null,
      }),
    );
    return this.toDto(saved);
  }

  async remove(walletAddress: string, id: string, isAdmin = false): Promise<void> {
    const link = await this.links.findOne({ where: { id } });
    if (!link) throw new ResourceNotFoundException('Portfolio link', id);
    if (!isAdmin && link.walletAddress !== walletAddress) {
      throw new ResourceNotFoundException('Portfolio link', id);
    }
    await this.links.remove(link);
  }

  private toDto(link: PortfolioLink): PortfolioLinkResponseDto {
    return {
      id: link.id,
      platform: link.platform,
      url: link.url,
      displayTitle: link.displayTitle,
      createdAt: link.createdAt,
    };
  }
}
