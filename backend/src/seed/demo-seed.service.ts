import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../auth/auth.types';
import { normalizeWalletAddress } from '../common/utils/wallet.utils';
import { AvailabilitySlot } from '../availability/availability-slot.entity';
import { MenteeProfile } from '../profile/mentee-profile.entity';
import { MentorProfile } from '../profile/mentor-profile.entity';
import { RoleEntity } from '../user/role.entity';
import { User } from '../user/user.entity';
import { UserStatus } from '../user/user-status.enum';
import {
  DEMO_MENTEES,
  DEMO_MENTORS,
  DemoAccountIdentity,
  DemoMentee,
  DemoMentor,
} from './demo-data';
import { DEMO_WALLET_FACTORY } from './demo-wallet';
import type { DemoWalletFactory } from './demo-wallet';

export interface DemoSeedResult {
  mentorsCreated: number;
  menteesCreated: number;
  skipped: number;
}

interface ResolvedDemoUser {
  user: User;
  created: boolean;
}

@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger(DemoSeedService.name);
  private readonly maxWalletAttempts = 5;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
    @InjectRepository(MentorProfile)
    private readonly mentors: Repository<MentorProfile>,
    @InjectRepository(MenteeProfile)
    private readonly mentees: Repository<MenteeProfile>,
    @InjectRepository(AvailabilitySlot)
    private readonly slots: Repository<AvailabilitySlot>,
    @Inject(DEMO_WALLET_FACTORY)
    private readonly walletFactory: DemoWalletFactory,
  ) {}

  async seed(): Promise<DemoSeedResult> {
    const mentorRole = await this.ensureRole(Role.MENTOR);
    const menteeRole = await this.ensureRole(Role.MENTEE);

    let mentorsCreated = 0;
    let menteesCreated = 0;
    let skipped = 0;

    for (const demo of DEMO_MENTORS) {
      const resolved = await this.resolveUser(demo, mentorRole);
      if (!resolved) {
        skipped += 1;
        continue;
      }
      await this.saveMentorProfile(demo, resolved.user.walletAddress);
      await this.saveAvailability(demo, resolved.user.walletAddress);
      if (resolved.created) mentorsCreated += 1;
    }

    for (const demo of DEMO_MENTEES) {
      const resolved = await this.resolveUser(demo, menteeRole);
      if (!resolved) {
        skipped += 1;
        continue;
      }
      await this.saveMenteeProfile(demo, resolved.user.walletAddress);
      if (resolved.created) menteesCreated += 1;
    }

    const result = { mentorsCreated, menteesCreated, skipped };
    this.logger.log(
      `Demo seed complete: ${mentorsCreated} mentors and ${menteesCreated} mentees created, ${skipped} skipped`,
    );
    return result;
  }

  private async ensureRole(name: Role): Promise<RoleEntity> {
    const existing = await this.roles.findOne({ where: { name } });
    if (existing) return existing;
    return this.roles.save(this.roles.create({ name, permissions: [] }));
  }

  private async resolveUser(
    demo: DemoAccountIdentity,
    role: RoleEntity,
  ): Promise<ResolvedDemoUser | null> {
    const byEmail = await this.users.findOne({
      where: { email: demo.email },
      relations: { roles: true },
      withDeleted: true,
    });
    const byUsername = await this.users.findOne({
      where: { username: demo.username },
      relations: { roles: true },
      withDeleted: true,
    });

    if (
      byEmail &&
      byUsername &&
      byEmail.walletAddress !== byUsername.walletAddress
    ) {
      this.logger.warn(
        `Skipping demo identity ${demo.email}: email and username belong to different accounts`,
      );
      return null;
    }

    const existing = byEmail ?? byUsername;
    if (existing) {
      if (
        existing.deletedAt ||
        existing.email !== demo.email ||
        existing.username !== demo.username
      ) {
        this.logger.warn(
          `Skipping demo identity ${demo.email}: identity belongs to a non-demo account`,
        );
        return null;
      }
      return {
        user: await this.users.save(this.attachRole(existing, role)),
        created: false,
      };
    }

    for (let attempt = 0; attempt < this.maxWalletAttempts; attempt += 1) {
      const walletAddress = normalizeWalletAddress(this.walletFactory());
      const taken = await this.users.findOne({
        where: { walletAddress },
        withDeleted: true,
      });
      if (taken) continue;

      const user = this.users.create({
        walletAddress,
        email: demo.email,
        username: demo.username,
        displayName: demo.displayName,
        status: UserStatus.ACTIVE,
        avatarUrl: null,
        timezone: 'UTC',
        locale: 'en',
        usernameChangedAt: null,
        lastLoginAt: null,
        education: demo.education ?? [],
        certifications: demo.certifications ?? [],
      });
      return {
        user: await this.users.save(this.attachRole(user, role)),
        created: true,
      };
    }

    throw new Error(
      `Could not generate a unique Stellar wallet for ${demo.email}`,
    );
  }

  private attachRole(user: User, role: RoleEntity): User {
    const roles = user.roles ?? [];
    user.roles = roles.some((existing) => existing.name === role.name)
      ? roles
      : [...roles, role];
    user.role = role.name;
    return user;
  }

  private async saveMentorProfile(
    demo: DemoMentor,
    walletAddress: string,
  ): Promise<void> {
    const existing = await this.mentors.findOne({ where: { walletAddress } });
    const profile = existing ?? this.mentors.create({ walletAddress });
    Object.assign(profile, {
      bio: demo.bio,
      skills: [...demo.skills],
      expertiseAreas: [...demo.expertiseAreas],
      hourlyRateUsdCents: demo.hourlyRateUsdCents,
      maxMentees: demo.maxMentees,
      languages: [...demo.languages],
      isActive: true,
    });
    await this.mentors.save(profile);
  }

  private async saveMenteeProfile(
    demo: DemoMentee,
    walletAddress: string,
  ): Promise<void> {
    const existing = await this.mentees.findOne({ where: { walletAddress } });
    const profile = existing ?? this.mentees.create({ walletAddress });
    Object.assign(profile, {
      learningGoals: demo.learningGoals,
      interests: [...demo.interests],
      experienceLevel: demo.experienceLevel,
      budgetUsdCentsPerMonth: demo.budgetUsdCentsPerMonth,
      languages: [...demo.languages],
      isActive: true,
    });
    await this.mentees.save(profile);
  }

  private async saveAvailability(
    demo: DemoMentor,
    walletAddress: string,
  ): Promise<void> {
    const existing = await this.slots.find({
      where: { mentorId: walletAddress },
    });
    if (existing.length > 0) return;

    const slots = demo.availability.map((slot) =>
      this.slots.create({ mentorId: walletAddress, ...slot }),
    );
    await this.slots.save(slots);
  }
}
