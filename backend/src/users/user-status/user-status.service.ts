import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { AuditEvent } from '../../audit/entities/audit-log.entity';
import { User } from '../entities/user.entity';
import { UserStatus, canTransition } from './user-status.enum';

@Injectable()
export class UserStatusService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly audit: AuditService,
  ) {}

  /** WHERE fragment that hides non-active users from public endpoints. */
  activeOnly(): FindOptionsWhere<User> {
    return { status: UserStatus.ACTIVE };
  }

  async changeStatus(userId: string, status: UserStatus, actorId?: string): Promise<User> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const current = user.status ?? UserStatus.ACTIVE;
    if (!canTransition(current, status)) {
      throw new BadRequestException(`Cannot change user status from '${current}' to '${status}'`);
    }
    if (current === status) return user;

    user.status = status;
    await this.users.save(user);
    await this.audit.record({
      event: AuditEvent.USER_STATUS_CHANGED,
      userId,
      metadata: { from: current, to: status, actorId: actorId ?? null },
    });
    return user;
  }
}
