import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Listing } from './entities/listing.entity';
import { ListingVersion } from './entities/listing-version.entity';
import {
  CreateListingDto,
  UpdateListingDto,
  RevertVersionDto,
} from './dto/listing.dto';
import { ListingVersionService } from './listing-version.service';
import { RevertResult } from './interfaces/version-response.interface';

@Injectable()
export class ListingService {
  private readonly logger = new Logger(ListingService.name);

  constructor(
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
    private readonly versionService: ListingVersionService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────────

  async create(dto: CreateListingDto, userId: string): Promise<Listing> {
    return this.dataSource.transaction(async (manager) => {
      const listing = manager.create(Listing, {
        ...dto,
        createdBy: userId,
        currentVersion: 1,
      });

      const saved = await manager.save(Listing, listing);

      // Capture version 1 — the initial state
      await this.versionService.captureVersion(
        saved,
        userId,
        'Initial listing created',
        manager,
      );

      this.logger.log(`Created listing ${saved.id} (v1) by user ${userId}`);
      return saved;
    });
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  async findOne(id: string): Promise<Listing> {
    const listing = await this.listingRepo.findOne({ where: { id } });
    if (!listing) throw new NotFoundException(`Listing ${id} not found`);
    return listing;
  }

  // ─── Update ──────────────────────────────────────────────────────────────────

  /**
   * Applies the patch, increments currentVersion, and captures a new version
   * snapshot — all within a single database transaction.
   */
  async update(
    id: string,
    dto: UpdateListingDto,
    userId: string,
  ): Promise<Listing> {
    return this.dataSource.transaction(async (manager) => {
      // Pessimistic write lock prevents concurrent version number collisions
      const listing = await manager.findOne(Listing, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!listing) throw new NotFoundException(`Listing ${id} not found`);

      const { changeNote, ...patch } = dto;

      Object.assign(listing, patch);
      listing.currentVersion += 1;

      const saved = await manager.save(Listing, listing);

      await this.versionService.captureVersion(
        saved,
        userId,
        changeNote ?? null,
        manager,
      );

      this.logger.log(
        `Updated listing ${id} → v${saved.currentVersion} by user ${userId}`,
      );
      return saved;
    });
  }

  // ─── Revert ──────────────────────────────────────────────────────────────────

  /**
   * Restores the listing to the state captured in `targetVersionNumber`.
   * This does NOT delete existing versions — it creates a NEW version whose
   * snapshot matches the target, preserving full history.
   */
  async revertToVersion(
    id: string,
    targetVersionNumber: number,
    dto: RevertVersionDto,
    userId: string,
  ): Promise<RevertResult> {
    return this.dataSource.transaction(async (manager) => {
      const listing = await manager.findOne(Listing, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!listing) throw new NotFoundException(`Listing ${id} not found`);

      if (targetVersionNumber >= listing.currentVersion) {
        throw new ForbiddenException(
          `Target version ${targetVersionNumber} is not older than the current version ${listing.currentVersion}. Nothing to revert.`,
        );
      }

      const targetVersion = await manager.findOne(ListingVersion, {
        where: { listingId: id, versionNumber: targetVersionNumber },
      });

      if (!targetVersion) {
        throw new NotFoundException(
          `Version ${targetVersionNumber} not found for listing ${id}`,
        );
      }

      // Restore all snapshotted fields onto the listing entity
      const { snapshot } = targetVersion;
      Object.assign(listing, {
        title: snapshot.title,
        description: snapshot.description,
        price: snapshot.price,
        category: snapshot.category,
        status: snapshot.status,
        tags: snapshot.tags,
        durationMinutes: snapshot.durationMinutes,
        coverImageUrl: snapshot.coverImageUrl,
        metadata: snapshot.metadata,
      });
      listing.currentVersion += 1;

      const saved = await manager.save(Listing, listing);

      const note =
        dto.changeNote ??
        `Reverted to version ${targetVersionNumber}`;

      await this.versionService.captureVersion(saved, userId, note, manager);

      this.logger.log(
        `Listing ${id} reverted to v${targetVersionNumber} → new v${saved.currentVersion} by user ${userId}`,
      );

      return {
        listing: {
          id: saved.id,
          currentVersion: saved.currentVersion,
          updatedAt: saved.updatedAt,
        },
        newVersionNumber: saved.currentVersion,
        revertedFrom: targetVersionNumber,
      };
    });
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────

  async remove(id: string, userId: string): Promise<void> {
    const listing = await this.findOne(id);
    await this.listingRepo.remove(listing);
    this.logger.log(`Listing ${id} deleted by user ${userId}`);
  }
}
