import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { ProfileHistory } from '../users/entities/profile-history.entity';
import { PaginationService } from '../common/pagination/pagination.service';
import { PaginatedResponse } from '../common/pagination/interfaces/paginated-response.interface';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(ProfileHistory) private readonly historyRepo: Repository<ProfileHistory>,
    private readonly paginationService: PaginationService,
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
    page = 1,
  ): Promise<PaginatedResponse<ProfileHistory>> {
    const queryBuilder = this.historyRepo
      .createQueryBuilder('history')
      .where('history.userId = :userId', { userId })
      .orderBy('history.changedAt', 'DESC');

    return this.paginationService.paginate(queryBuilder, page, limit, {
      route: `/admin/users/${userId}/profile-history`,
    });
  }
}
