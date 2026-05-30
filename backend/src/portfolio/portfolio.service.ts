import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PortfolioLink, PortfolioPlatform } from './entities/portfolio-link.entity';
import { CreatePortfolioLinkDto } from './dto/create-portfolio-link.dto';

const MAX_LINKS = 10;

function detectPlatform(url: string): PortfolioPlatform {
  const host = new URL(url).hostname.replace('www.', '');
  if (host.includes('github.com')) return PortfolioPlatform.GITHUB;
  if (host.includes('linkedin.com')) return PortfolioPlatform.LINKEDIN;
  if (host.includes('twitter.com') || host.includes('x.com')) return PortfolioPlatform.TWITTER;
  if (host.includes('behance.net')) return PortfolioPlatform.BEHANCE;
  if (host.includes('dribbble.com')) return PortfolioPlatform.DRIBBBLE;
  if (host.includes('medium.com')) return PortfolioPlatform.MEDIUM;
  if (host.includes('dev.to')) return PortfolioPlatform.DEVTO;
  if (host.includes('youtube.com')) return PortfolioPlatform.YOUTUBE;
  return PortfolioPlatform.OTHER;
}

@Injectable()
export class PortfolioService {
  constructor(
    @InjectRepository(PortfolioLink)
    private readonly repo: Repository<PortfolioLink>,
  ) {}

  async findAll(userId: string): Promise<PortfolioLink[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  async create(userId: string, dto: CreatePortfolioLinkDto): Promise<PortfolioLink> {
    const count = await this.repo.count({ where: { userId } });
    if (count >= MAX_LINKS) {
      throw new BadRequestException(`Maximum ${MAX_LINKS} portfolio links allowed`);
    }

    const sanitizedUrl = new URL(dto.url).toString();

    const duplicate = await this.repo.findOne({ where: { userId, url: sanitizedUrl } });
    if (duplicate) throw new ConflictException('This URL is already in your portfolio');

    const link = this.repo.create({
      userId,
      url: sanitizedUrl,
      platform: dto.platform ?? detectPlatform(sanitizedUrl),
      title: dto.title ?? null,
    });
    return this.repo.save(link);
  }

  async remove(userId: string, id: string): Promise<void> {
    const link = await this.repo.findOne({ where: { id, userId } });
    if (!link) throw new NotFoundException('Portfolio link not found');
    await this.repo.remove(link);
  }
}
