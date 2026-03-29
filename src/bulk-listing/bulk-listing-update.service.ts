import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Listing } from './entities/listing.entity';
import {
  BulkListingUpdateDto,
  BulkListingUpdateResponseDto,
  ListingUpdateItemDto,
  ListingUpdateResultDto,
} from './dto/bulk-listing-update.dto';

/** Maximum rows processed in a single SQL UPDATE batch */
const CHUNK_SIZE = 20;

@Injectable()
export class BulkListingUpdateService {
  private readonly logger = new Logger(BulkListingUpdateService.name);

  constructor(
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Apply partial updates to many listings in one request.
   *
   * Strategy
   * --------
   * 1. Fetch all requested listings in a single SELECT … WHERE id IN (…).
   * 2. Verify ownership so a user cannot mutate someone else's listings.
   * 3. Split the update set into CHUNK_SIZE batches.
   * 4. Each chunk runs inside a single DB transaction:
   *      – merge field-level changes into the in-memory entity
   *      – bulk-save with repo.save([…]) so TypeORM issues one round-trip
   * 5. Collect per-item success / error and return a structured report.
   */
  async bulkUpdate(
    dto: BulkListingUpdateDto,
    requestingUserId: string,
  ): Promise<BulkListingUpdateResponseDto> {
    const ids = dto.updates.map((u) => u.id);

    // ── 1. Fetch existing listings ──────────────────────────────────────────
    const existingListings = await this.listingRepo.find({
      where: { id: In(ids) },
      select: ['id', 'ownerId', 'title', 'description', 'status', 'price',
               'category', 'isFeatured', 'maxMentees'],
    });

    const listingMap = new Map(existingListings.map((l) => [l.id, l]));

    // ── 2. Build per-item plan ──────────────────────────────────────────────
    const results: ListingUpdateResultDto[] = [];
    const toSave: Listing[] = [];

    for (const update of dto.updates) {
      const listing = listingMap.get(update.id);

      if (!listing) {
        results.push({ id: update.id, success: false, error: 'Listing not found' });
        continue;
      }

      if (listing.ownerId !== requestingUserId) {
        results.push({ id: update.id, success: false, error: 'Forbidden' });
        continue;
      }

      this.applyPatch(listing, update);
      toSave.push(listing);
    }

    // ── 3. Persist in chunks ────────────────────────────────────────────────
    const chunkResults = await this.saveInChunks(toSave);
    results.push(...chunkResults);

    // ── 4. Compile summary ──────────────────────────────────────────────────
    const succeeded = results.filter((r) => r.success).length;
    return {
      total: dto.updates.length,
      succeeded,
      failed: dto.updates.length - succeeded,
      results,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Merge only the fields that were explicitly supplied in the patch DTO.
   * Undefined fields are left untouched on the entity.
   */
  private applyPatch(listing: Listing, patch: ListingUpdateItemDto): void {
    const fields = [
      'title', 'description', 'status', 'price',
      'category', 'isFeatured', 'maxMentees',
    ] as const;

    for (const field of fields) {
      if (patch[field] !== undefined) {
        (listing as any)[field] = patch[field];
      }
    }
  }

  /**
   * Split entities into fixed-size batches and persist each batch in its own
   * transaction, collecting success / failure per entity.
   */
  private async saveInChunks(listings: Listing[]): Promise<ListingUpdateResultDto[]> {
    const results: ListingUpdateResultDto[] = [];

    for (let i = 0; i < listings.length; i += CHUNK_SIZE) {
      const chunk = listings.slice(i, i + CHUNK_SIZE);
      const chunkResults = await this.saveChunk(chunk);
      results.push(...chunkResults);
    }

    return results;
  }

  private async saveChunk(chunk: Listing[]): Promise<ListingUpdateResultDto[]> {
    const queryRunner =
      this.listingRepo.manager.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.save(Listing, chunk);
      await queryRunner.commitTransaction();

      this.logger.debug(`Saved chunk of ${chunk.length} listings`);
      return chunk.map((l) => ({ id: l.id, success: true }));
    } catch (err) {
      await queryRunner.rollbackTransaction();

      this.logger.warn(
        `Chunk save failed – falling back to per-item saves. Error: ${err?.message}`,
      );

      // Graceful degradation: try each row individually so one bad row
      // doesn't block the rest of the chunk.
      return this.saveItemByItem(chunk);
    } finally {
      await queryRunner.release();
    }
  }

  /** Last-resort: attempt each row in isolation and record individual outcomes. */
  private async saveItemByItem(listings: Listing[]): Promise<ListingUpdateResultDto[]> {
    const results: ListingUpdateResultDto[] = [];

    for (const listing of listings) {
      try {
        await this.listingRepo.save(listing);
        results.push({ id: listing.id, success: true });
      } catch (err) {
        this.logger.error(`Failed to save listing ${listing.id}: ${err?.message}`);
        results.push({ id: listing.id, success: false, error: err?.message });
      }
    }

    return results;
  }
}
