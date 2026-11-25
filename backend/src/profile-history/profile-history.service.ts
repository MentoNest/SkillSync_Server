import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm';
import { ResourceNotFoundException } from '../common/errors/app-exceptions';
import {
  ChangeReason,
  ProfileHistory,
  ProfileType,
} from './profile-history.entity';
import { maybeRedact } from './sensitive-fields';

export interface RecordChangeOptions {
  userId: string;
  profileType: ProfileType;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  changedBy: string;
  changeReason: ChangeReason;
  /** Override the timestamp; defaults to `new Date()`. */
  changedAt?: Date;
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

@Injectable()
export class ProfileHistoryService {
  private readonly logger = new Logger(ProfileHistoryService.name);

  constructor(
    @InjectRepository(ProfileHistory)
    private readonly repo: Repository<ProfileHistory>,
  ) {}

  /**
   * Appends one history entry.  Values for sensitive fields are redacted before
   * the row is written.  This method never updates or deletes existing rows.
   */
  async record(opts: RecordChangeOptions): Promise<void> {
    const changedAt = opts.changedAt ?? new Date();
    const retainUntil = new Date(changedAt.getTime() + ONE_YEAR_MS);

    const entry = this.repo.create({
      userId: opts.userId,
      profileType: opts.profileType,
      fieldName: opts.fieldName,
      oldValue: maybeRedact(opts.fieldName, opts.oldValue),
      newValue: maybeRedact(opts.fieldName, opts.newValue),
      changedBy: opts.changedBy,
      changeReason: opts.changeReason,
      changedAt,
      retainUntil,
    });

    try {
      await this.repo.save(entry);
    } catch (err) {
      // History write failures must never break the primary operation.
      this.logger.error(
        `Failed to write profile history for user=${opts.userId} field=${opts.fieldName}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Records multiple field changes atomically (all within one round-trip using
   * a bulk insert).  Used when several fields change in a single save() call.
   */
  async recordMany(entries: RecordChangeOptions[]): Promise<void> {
    if (entries.length === 0) return;

    const rows = entries.map((opts) => {
      const changedAt = opts.changedAt ?? new Date();
      return this.repo.create({
        userId: opts.userId,
        profileType: opts.profileType,
        fieldName: opts.fieldName,
        oldValue: maybeRedact(opts.fieldName, opts.oldValue),
        newValue: maybeRedact(opts.fieldName, opts.newValue),
        changedBy: opts.changedBy,
        changeReason: opts.changeReason,
        changedAt,
        retainUntil: new Date(changedAt.getTime() + ONE_YEAR_MS),
      });
    });

    try {
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(ProfileHistory)
        .values(rows as QueryDeepPartialEntity<ProfileHistory>[])
        .execute();
    } catch (err) {
      this.logger.error(
        `Failed to write ${rows.length} profile history entries for user=${entries[0].userId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Returns the full history for a user, newest first.
   * Throws ResourceNotFoundException if the userId has no history at all
   * (so the admin API returns 404 for unknown users rather than an empty list).
   */
  async getHistoryForUser(
    userId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<{ entries: ProfileHistory[]; total: number }> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;

    const [entries, total] = await this.repo.findAndCount({
      where: { userId },
      order: { changedAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    if (total === 0 && offset === 0) {
      throw new ResourceNotFoundException('User profile history', userId);
    }

    return { entries, total };
  }
}
