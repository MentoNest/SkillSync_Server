import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { ProfileHistory } from '../users/entities/profile-history.entity';
import { SuspensionService } from '../auth/suspension.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(ProfileHistory) private readonly historyRepo: Repository<ProfileHistory>,
    private readonly suspensionService: SuspensionService,
  ) {}

  async verifyMentor(
    mentorId: string,
    adminId: string,
    notes?: string,
  ): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: mentorId } });
    if (!user) throw new NotFoundException('Mentor not found');

    user.isVerified = true;
    user.verifiedAt = new Date();
    user.verifiedBy = adminId;
    user.verificationNotes = notes ?? null;
    return this.userRepo.save(user);
  }

  async revokeVerification(mentorId: string, adminId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: mentorId } });
    if (!user) throw new NotFoundException('Mentor not found');

    user.isVerified = false;
    user.verifiedAt = null;
    user.verifiedBy = adminId;
    user.verificationNotes = null;
    return this.userRepo.save(user);
  }

  async getProfileHistory(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ items: ProfileHistory[]; total: number }> {
    const [items, total] = await this.historyRepo.findAndCount({
      where: { userId },
      order: { changedAt: 'DESC' },
      take: limit,
      skip: offset,
    });

  async suspendUser(
    userId: string,
    adminId: string,
    reason: string,
    durationDays?: number | null,
  ) {
    return this.suspensionService.suspendUser(userId, adminId, reason, durationDays);
  }

  async unsuspendUser(userId: string, adminId: string) {
    return this.suspensionService.unsuspendUser(userId, adminId);
  }

  async listSuspendedUsers(limit = 50, offset = 0) {
    return this.suspensionService.listActiveSuspensions(limit, offset);
  }
    return { items, total };
  }
}
