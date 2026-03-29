import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Listing } from './entities/listing.entity';
import {
  ListingVersion,
  ListingSnapshot,
  FieldDiff,
} from './entities/listing-version.entity';
import { VersionQueryDto, CompareVersionsQueryDto } from './dto/listing.dto';
import {
  PaginatedVersions,
  VersionComparisonResult,
} from './interfaces/version-response.interface';

@Injectable()
export class ListingVersionService {
  private readonly logger = new Logger(ListingVersionService.name);

  constructor(
    @InjectRepository(ListingVersion)
    private readonly versionRepo: Repository<ListingVersion>,
  ) {}

  // ─── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Build an immutable snapshot from a Listing entity.
   */
  buildSnapshot(listing: Listing): ListingSnapshot {
    return {
      title: listing.title,
      description: listing.description,
      price: Number(listing.price),
      category: listing.category,
      status: listing.status,
      tags: listing.tags ?? [],
      durationMinutes: listing.durationMinutes,
      coverImageUrl: listing.coverImageUrl ?? null,
      metadata: listing.metadata ?? null,
    };
  }

  /**
   * Compute field-level diffs between two snapshots.
   * Returns an empty array when there are no differences.
   */
  diffSnapshots(
    prev: ListingSnapshot | null,
    next: ListingSnapshot,
  ): FieldDiff[] {
    if (!prev) return [];

    const diffs: FieldDiff[] = [];
    const keys = Object.keys(next) as (keyof ListingSnapshot)[];

    for (const key of keys) {
      const fromVal = prev[key];
      const toVal = next[key];

      // Deep equality for arrays/objects
      if (JSON.stringify(fromVal) !== JSON.stringify(toVal)) {
        diffs.push({ field: key, from: fromVal, to: toVal });
      }
    }

    return diffs;
  }

  /**
   * Capture a new version for `listing` inside the provided EntityManager
   * transaction. Always call this AFTER the listing row has been updated.
   *
   * @param listing   The already-updated listing entity
   * @param changedBy User UUID who triggered the change
   * @param changeNote Optional human-readable note
   * @param manager   Transactional EntityManager (required for atomicity)
   */
  async captureVersion(
    listing: Listing,
    changedBy: string,
    changeNote: string | null,
    manager: EntityManager,
  ): Promise<ListingVersion> {
    const snapshot = this.buildSnapshot(listing);
    const versionNumber = listing.currentVersion;

    // Fetch the immediately preceding snapshot for diff calculation
    let changedFields: FieldDiff[] = [];
    if (versionNumber > 1) {
      const prev = await manager.findOne(ListingVersion, {
        where: { listingId: listing.id, versionNumber: versionNumber - 1 },
      });
      if (prev) {
        changedFields = this.diffSnapshots(prev.snapshot, snapshot);
      }
    }

    const version = manager.create(ListingVersion, {
      listingId: listing.id,
      versionNumber,
      snapshot,
      changedFields,
      changeNote: changeNote ?? null,
      changedBy,
    });

    const saved = await manager.save(ListingVersion, version);
    this.logger.log(
      `Captured version ${versionNumber} for listing ${listing.id} by user ${changedBy}`,
    );
    return saved;
  }

  // ─── Public query API ────────────────────────────────────────────────────────

  /**
   * Paginated version history for a listing, newest first.
   */
  async getHistory(
    listingId: string,
    query: VersionQueryDto,
  ): Promise<PaginatedVersions> {
    const { page = 1, limit = 20, changedBy } = query;
    const skip = (page - 1) * limit;

    const qb = this.versionRepo
      .createQueryBuilder('v')
      .where('v.listingId = :listingId', { listingId })
      .orderBy('v.versionNumber', 'DESC')
      .skip(skip)
      .take(limit);

    if (changedBy) {
      qb.andWhere('v.changedBy = :changedBy', { changedBy });
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Fetch a specific version by its sequential version number.
   */
  async getVersion(
    listingId: string,
    versionNumber: number,
  ): Promise<ListingVersion> {
    const version = await this.versionRepo.findOne({
      where: { listingId, versionNumber },
    });

    if (!version) {
      throw new NotFoundException(
        `Version ${versionNumber} not found for listing ${listingId}`,
      );
    }

    return version;
  }

  /**
   * Compute the diff between any two version numbers (order-agnostic).
   */
  async compareVersions(
    listingId: string,
    query: CompareVersionsQueryDto,
  ): Promise<VersionComparisonResult> {
    const { v1, v2 } = query;

    if (v1 === v2) {
      throw new BadRequestException('Cannot compare a version with itself.');
    }

    const [versionA, versionB] = await Promise.all([
      this.getVersion(listingId, v1),
      this.getVersion(listingId, v2),
    ]);

    // Always diff from earlier → later
    const [earlier, later] =
      versionA.versionNumber < versionB.versionNumber
        ? [versionA, versionB]
        : [versionB, versionA];

    const diffs = this.diffSnapshots(earlier.snapshot, later.snapshot);

    return {
      listingId,
      v1: earlier.versionNumber,
      v2: later.versionNumber,
      diffs,
      v1CreatedAt: earlier.createdAt,
      v2CreatedAt: later.createdAt,
    };
  }
}
