import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { REDIS } from '../../redis/redis.module';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { User } from '../entities/user.entity';
import { CompletenessResult, ProfileCompletenessInput, computeCompleteness } from './profile-completeness';

interface MenteeProfileRow {
  learning_goals: string[] | null;
  skill_level: string | null;
  areas_of_interest: string[] | null;
}

const CACHE_TTL_SECONDS = 300;
const cacheKey = (userId: string) => `profile:completeness:${userId}`;

/**
 * Computes profile completeness dynamically (never stored). Mentor/mentee profile
 * tables beyond `mentor_profiles` may not exist on this branch, so those lookups
 * are best-effort and degrade gracefully.
 */
@Injectable()
export class ProfileCompletenessService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(MentorProfile) private readonly mentors: Repository<MentorProfile>,
    @Optional() @Inject(REDIS) private readonly redis?: Redis,
  ) {}

  async compute(userId: string): Promise<CompletenessResult> {
    if (this.redis) {
      const cached = await this.redis.get(cacheKey(userId)).catch(() => null);
      if (cached) return JSON.parse(cached) as CompletenessResult;
    }

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const result = computeCompleteness(await this.gather(user));
    if (this.redis) {
      await this.redis.setex(cacheKey(userId), CACHE_TTL_SECONDS, JSON.stringify(result)).catch(() => undefined);
    }
    return result;
  }

  /** Convenience wrapper so profile responses can embed the numeric score. */
  async getScore(userId: string): Promise<number> {
    return (await this.compute(userId)).score;
  }

  async computeForAllUsers(): Promise<Array<{ userId: string; username: string | null; score: number }>> {
    const users = await this.users.find({ select: ['id', 'username'] });
    const results: Array<{ userId: string; username: string | null; score: number }> = [];
    for (const user of users) {
      const { score } = await this.compute(user.id);
      results.push({ userId: user.id, username: user.username, score });
    }
    return results;
  }

  private async gather(user: User): Promise<ProfileCompletenessInput> {
    const mentor = await this.mentors.findOne({ where: { userId: user.id } });
    const portfolioLinks = await this.countOptional('portfolio_links', user.id);

    if (mentor) {
      return {
        profileType: 'mentor',
        bio: mentor.bio,
        skills: mentor.skills,
        hourlyRate: mentor.hourlyRate === null ? null : Number(mentor.hourlyRate),
        expertiseAreas: mentor.expertiseAreas,
        avatarUrl: user.avatarUrl,
        availabilitySlots: await this.countOptional('availability_slots', user.id),
        education: mentor.education,
        certifications: mentor.certifications,
        portfolioLinks,
      };
    }

    const mentee = await this.loadMentee(user.id);
    return {
      profileType: 'mentee',
      avatarUrl: user.avatarUrl,
      learningGoals: mentee?.learning_goals ?? null,
      skillLevel: mentee?.skill_level ?? null,
      areasOfInterest: mentee?.areas_of_interest ?? null,
      portfolioLinks,
    };
  }

  private async loadMentee(userId: string): Promise<MenteeProfileRow | null> {
    try {
      const rows = await this.mentors.query(
        `SELECT "learning_goals", "skill_level", "areas_of_interest" FROM "mentee_profiles" WHERE "user_id" = $1 LIMIT 1`,
        [userId],
      );
      return (rows?.[0] as MenteeProfileRow) ?? null;
    } catch {
      return null;
    }
  }

  private async countOptional(table: string, userId: string): Promise<number> {
    try {
      const rows = await this.mentors.query(`SELECT COUNT(*)::int AS count FROM "${table}" WHERE "user_id" = $1`, [
        userId,
      ]);
      return Number(rows?.[0]?.count ?? 0);
    } catch {
      return 0;
    }
  }
}
