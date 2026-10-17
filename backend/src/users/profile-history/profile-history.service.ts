import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfileHistory } from './entities/profile-history.entity';

export const MIN_RETENTION_DAYS = 365;

export interface PagedProfileHistory {
  data: ProfileHistory[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Read-only, append-only access to profile change history (#1452). */
@Injectable()
export class ProfileHistoryService {
  constructor(@InjectRepository(ProfileHistory) private readonly history: Repository<ProfileHistory>) {}

  /** Retention is guaranteed at >= 1 year; the scheduled purge uses MIN_RETENTION_DAYS. */
  get retentionDays(): number {
    return MIN_RETENTION_DAYS;
  }

  async listForUser(userId: string, page = 1, limit = 50): Promise<PagedProfileHistory> {
    const [data, total] = await this.history.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 0 };
  }
}
