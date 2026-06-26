import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChangeReason, ProfileHistory, ProfileType } from './entities/profile-history.entity';

export interface LogChangeInput {
  userId: string;
  profileType: ProfileType;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  changedBy: string;
  changeReason?: ChangeReason;
}

@Injectable()
export class ProfileHistoryService {
  constructor(
    @InjectRepository(ProfileHistory)
    private readonly repo: Repository<ProfileHistory>,
  ) {}

  async logChange(input: LogChangeInput): Promise<ProfileHistory> {
    const entry = this.repo.create({
      userId: input.userId,
      profileType: input.profileType,
      fieldName: input.fieldName,
      oldValue: input.oldValue,
      newValue: input.newValue,
      changedBy: input.changedBy,
      changeReason: input.changeReason ?? 'user_edit',
    });
    return this.repo.save(entry);
  }

  async getHistory(userId: string): Promise<ProfileHistory[]> {
    return this.repo.find({
      where: { userId },
      order: { timestamp: 'DESC' },
    });
  }
}
