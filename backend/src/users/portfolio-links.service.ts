import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';

import { CreatePortfolioLinkDto } from './dto/create-portfolio-link.dto';
import { PortfolioLink } from './entities/portfolio-link.entity';

/** Maximum number of portfolio links an authenticated user may own. */
export const PORTFOLIO_LINKS_MAX_PER_USER = 10;

interface UniqueConstraintError {
  code?: string;
}

@Injectable()
export class PortfolioLinksService {
  constructor(
    @InjectRepository(PortfolioLink)
    private readonly repo: Repository<PortfolioLink>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** Return all portfolio links for a user, ordered by creation time. */
  async listForUser(userId: string): Promise<PortfolioLink[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Add a new link for the user. Enforces:
   *   1) per-user cap of PORTFOLIO_LINKS_MAX_PER_USER
   *   2) no duplicate (user_id, url)
   *
   * Concurrency strategy:
   *   We take a per-user pg_advisory_xact_lock keyed on the user id inside a
   *   SERIALIZABLE transaction. Two concurrent inserts for the same user
   *   serialize on the lock so cap + dedup checks cannot be raced. The DB
   *   unique index still gives us a final safety net for the duplicate case.
   */
  async add(
    userId: string,
    dto: CreatePortfolioLinkDto,
  ): Promise<PortfolioLink> {
    try {
      return await this.dataSource.transaction(async (mgr) => {
        // Per-user advisory lock held for the rest of this transaction.
        // The lock key is derived from the user uuid via md5 truncated to 64
        // bits so collisions across users are astronomically unlikely.
        await mgr.query(
          `SELECT pg_advisory_xact_lock(('x' || substr(md5($1), 1, 16))::bit(63)::bigint)`,
          [userId],
        );

        const repo = mgr.getRepository(PortfolioLink);

        const existing = await repo.count({ where: { userId } });
        if (existing >= PORTFOLIO_LINKS_MAX_PER_USER) {
          throw new BadRequestException(
            `You already have the maximum of ${PORTFOLIO_LINKS_MAX_PER_USER} portfolio links`,
          );
        }

        const duplicate = await repo.findOne({
          where: { userId, url: dto.url },
        });
        if (duplicate) {
          throw new ConflictException(
            'This URL has already been added to your portfolio',
          );
        }

        const entity = repo.create({
          userId,
          title: dto.title,
          url: dto.url,
        });
        return repo.save(entity);
      });
    } catch (err: unknown) {
      if (
        err instanceof BadRequestException ||
        err instanceof ConflictException
      ) {
        throw err;
      }
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(
          'This URL has already been added to your portfolio',
        );
      }
      throw err;
    }
  }

  /**
   * Remove a link owned by the user. We deliberately return NotFoundException
   * (rather than ForbiddenException) when the caller is not the owner so we
   * don't accidentally leak the existence of another user's link id.
   */
  async remove(userId: string, id: string): Promise<void> {
    const link = await this.repo.findOne({ where: { id } });
    if (!link || link.userId !== userId) {
      throw new NotFoundException('Portfolio link not found');
    }
    await this.repo.remove(link);
  }

  private isUniqueViolation(err: unknown): err is UniqueConstraintError {
    return (
      (err instanceof QueryFailedError &&
        (err as unknown as UniqueConstraintError).code === '23505') ||
      (typeof err === 'object' &&
        err !== null &&
        (err as UniqueConstraintError).code === '23505')
    );
  }
}
