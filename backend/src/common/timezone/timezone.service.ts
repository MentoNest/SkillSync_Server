import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { DEFAULT_TIMEZONE, isValidTimezone, normalizeTimezone } from './timezone.util';

@Injectable()
export class TimezoneService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  /** The stored IANA timezone for a user, or 'UTC' when unset/invalid. */
  async getUserTimezone(userId: string): Promise<string> {
    const user = await this.users.findOne({ where: { id: userId }, select: ['id', 'timezone'] });
    return normalizeTimezone(user?.timezone, DEFAULT_TIMEZONE);
  }

  /** Persist a new timezone preference after validating it against IANA. */
  async setUserTimezone(userId: string, timezone: string): Promise<string> {
    if (!isValidTimezone(timezone)) throw new BadRequestException('Invalid IANA timezone');
    await this.users.update({ id: userId }, { timezone });
    return timezone;
  }
}
