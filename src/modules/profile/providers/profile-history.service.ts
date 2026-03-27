import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfileHistory, ProfileType } from '../entities/profile-history.entity';
import { User } from '../../user/entities/user.entity';

export interface HistoryEntry {
  fieldName: string;
  oldValue: any;
  newValue: any;
}

@Injectable()
export class ProfileHistoryService {
  constructor(
    @InjectRepository(ProfileHistory)
    private profileHistoryRepository: Repository<ProfileHistory>,
  ) {}

  /**
   * Log a single field change to history
   */
  async logChange(
    user: User,
    profileType: ProfileType,
    profileId: string,
    fieldName: string,
    oldValue: any,
    newValue: any,
    changedBy?: User,
  ): Promise<ProfileHistory> {
    const historyEntry = this.profileHistoryRepository.create({
      user,
      profileType,
      profileId,
      fieldName,
      oldValue: oldValue !== undefined ? JSON.stringify(oldValue) : null,
      newValue: newValue !== undefined ? JSON.stringify(newValue) : null,
      changedBy: changedBy || null,
    });

    return this.profileHistoryRepository.save(historyEntry);
  }

  /**
   * Log multiple field changes at once
   */
  async logChanges(
    user: User,
    profileType: ProfileType,
    profileId: string,
    changes: HistoryEntry[],
    changedBy?: User,
  ): Promise<ProfileHistory[]> {
    const historyEntries = changes.map(change =>
      this.profileHistoryRepository.create({
        user,
        profileType,
        profileId,
        fieldName: change.fieldName,
        oldValue: change.oldValue !== undefined ? JSON.stringify(change.oldValue) : null,
        newValue: change.newValue !== undefined ? JSON.stringify(change.newValue) : null,
        changedBy: changedBy || null,
      }),
    );

    return this.profileHistoryRepository.save(historyEntries);
  }

  /**
   * Compare old and new objects and log all changes
   */
  async trackChanges<T extends Record<string, any>>(
    user: User,
    profileType: ProfileType,
    profileId: string,
    oldData: T,
    newData: Partial<T>,
    changedBy?: User,
  ): Promise<ProfileHistory[]> {
    const changes: HistoryEntry[] = [];

    for (const [key, newValue] of Object.entries(newData)) {
      // Skip if key doesn't exist in old data or values are the same
      if (!(key in oldData)) continue;
      
      const oldValue = oldData[key];
      
      // Compare values (handle arrays and objects by stringifying)
      const oldStr = JSON.stringify(oldValue);
      const newStr = JSON.stringify(newValue);
      
      if (oldStr !== newStr) {
        changes.push({
          fieldName: key,
          oldValue,
          newValue,
        });
      }
    }

    if (changes.length === 0) {
      return [];
    }

    return this.logChanges(user, profileType, profileId, changes, changedBy);
  }

  /**
   * Get history for a specific user
   */
  async getHistoryByUser(userId: string): Promise<ProfileHistory[]> {
    return this.profileHistoryRepository.find({
      where: { user: { id: userId } },
      relations: ['user', 'changedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get history for a specific profile
   */
  async getHistoryByProfile(profileId: string): Promise<ProfileHistory[]> {
    return this.profileHistoryRepository.find({
      where: { profileId },
      relations: ['user', 'changedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get all history entries with pagination
   */
  async getAllHistory(page: number = 1, limit: number = 20): Promise<{ data: ProfileHistory[]; total: number }> {
    const [data, total] = await this.profileHistoryRepository.findAndCount({
      relations: ['user', 'changedBy'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total };
  }
}
