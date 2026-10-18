import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../rbac/entities/role.entity';
import { RoleName } from '../rbac/roles';
import { MenteeProfile, SkillLevel } from '../users/entities/mentee-profile.entity';
import { MentorProfile } from '../users/entities/mentor-profile.entity';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/user-status/user-status.enum';

/**
 * Deterministic demo wallets (Stellar-like 56-char G… addresses).
 * Marked via username `demo_mentor_N@example.com` / `demo_mentee_N@example.com`.
 */
const DEMO_MENTORS = [
  {
    n: 1,
    wallet: 'GDEMO000100000000000000000000000000000000000000000000000',
    displayName: 'Demo Mentor Ada',
    skills: ['TypeScript', 'NestJS', 'System Design'],
    rate: 80,
    bio: 'Staff engineer mentoring backend and API design.',
  },
  {
    n: 2,
    wallet: 'GDEMO000200000000000000000000000000000000000000000000000',
    displayName: 'Demo Mentor Lin',
    skills: ['React', 'Accessibility', 'Design Systems'],
    rate: 65,
    bio: 'Frontend lead focused on inclusive UI.',
  },
  {
    n: 3,
    wallet: 'GDEMO000300000000000000000000000000000000000000000000000',
    displayName: 'Demo Mentor Sam',
    skills: ['Solidity', 'Stellar', 'Web3 Security'],
    rate: 120,
    bio: 'Smart-contract auditor and mentor.',
  },
  {
    n: 4,
    wallet: 'GDEMO000400000000000000000000000000000000000000000000000',
    displayName: 'Demo Mentor Priya',
    skills: ['Product', 'User Research', 'Roadmapping'],
    rate: 70,
    bio: 'PM helping mentees ship user-centred products.',
  },
  {
    n: 5,
    wallet: 'GDEMO000500000000000000000000000000000000000000000000000',
    displayName: 'Demo Mentor Omar',
    skills: ['DevOps', 'Kubernetes', 'Observability'],
    rate: 90,
    bio: 'SRE coaching reliable delivery practices.',
  },
] as const;

const DEMO_MENTEES = [
  {
    n: 1,
    wallet: 'GDEMO001100000000000000000000000000000000000000000000000',
    displayName: 'Demo Mentee Jess',
    goals: ['Land a junior backend role', 'Learn NestJS'],
    interests: ['APIs', 'Databases'],
    level: SkillLevel.BEGINNER,
  },
  {
    n: 2,
    wallet: 'GDEMO001200000000000000000000000000000000000000000000000',
    displayName: 'Demo Mentee Kai',
    goals: ['Improve system design interviews'],
    interests: ['Distributed systems'],
    level: SkillLevel.INTERMEDIATE,
  },
  {
    n: 3,
    wallet: 'GDEMO001300000000000000000000000000000000000000000000000',
    displayName: 'Demo Mentee Noor',
    goals: ['Ship an accessible React portfolio'],
    interests: ['Frontend', 'a11y'],
    level: SkillLevel.BEGINNER,
  },
  {
    n: 4,
    wallet: 'GDEMO001400000000000000000000000000000000000000000000000',
    displayName: 'Demo Mentee Eli',
    goals: ['Contribute to open-source Web3'],
    interests: ['Stellar', 'Rust'],
    level: SkillLevel.INTERMEDIATE,
  },
  {
    n: 5,
    wallet: 'GDEMO001500000000000000000000000000000000000000000000000',
    displayName: 'Demo Mentee Amara',
    goals: ['Transition into product management'],
    interests: ['Product', 'Research'],
    level: SkillLevel.ADVANCED,
  },
] as const;

@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(MentorProfile)
    private readonly mentors: Repository<MentorProfile>,
    @InjectRepository(MenteeProfile)
    private readonly mentees: Repository<MenteeProfile>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
  ) {}

  /**
   * Idempotent demo seed (#1474). Never deletes non-demo users.
   * Safe to run multiple times; existing demo rows are updated in place.
   */
  async seed(): Promise<{ mentors: number; mentees: number }> {
    const mentorRole = await this.roles.findOne({ where: { name: RoleName.MENTOR } });
    const menteeRole = await this.roles.findOne({ where: { name: RoleName.MENTEE } });
    if (!mentorRole || !menteeRole) {
      throw new Error('Roles not seeded yet — start the app once or run RBAC seed first');
    }

    let mentors = 0;
    for (const m of DEMO_MENTORS) {
      const username = `demo_mentor_${m.n}@example.com`;
      let user = await this.users.findOne({
        where: { walletAddress: m.wallet },
        relations: { roles: true },
      });
      if (!user) {
        user = this.users.create({
          walletAddress: m.wallet,
          username,
          displayName: m.displayName,
          status: UserStatus.ACTIVE,
          roles: [mentorRole],
        });
      } else {
        user.username = username;
        user.displayName = m.displayName;
        user.status = UserStatus.ACTIVE;
        if (!user.roles?.some((r) => r.id === mentorRole.id)) {
          user.roles = [...(user.roles ?? []), mentorRole];
        }
      }
      user = await this.users.save(user);

      let profile = await this.mentors.findOne({ where: { userId: user.id } });
      if (!profile) {
        profile = this.mentors.create({ userId: user.id });
      }
      profile.bio = m.bio;
      profile.skills = [...m.skills];
      profile.hourlyRate = m.rate;
      profile.expertiseAreas = [...m.skills];
      profile.yearsOfExperience = 3 + m.n;
      profile.currentRole = 'Demo Mentor';
      profile.company = 'SkillSync Demo';
      profile.isVerified = true;
      profile.verifiedAt = new Date();
      profile.verificationMethod = 'email';
      profile.verificationNotes = 'Demo account — not a real mentor';
      profile.averageRating = 4.2 + m.n * 0.1;
      profile.reviewCount = 5 * m.n;
      await this.mentors.save(profile);
      mentors += 1;
    }

    let mentees = 0;
    for (const m of DEMO_MENTEES) {
      const username = `demo_mentee_${m.n}@example.com`;
      let user = await this.users.findOne({
        where: { walletAddress: m.wallet },
        relations: { roles: true },
      });
      if (!user) {
        user = this.users.create({
          walletAddress: m.wallet,
          username,
          displayName: m.displayName,
          status: UserStatus.ACTIVE,
          roles: [menteeRole],
        });
      } else {
        user.username = username;
        user.displayName = m.displayName;
        user.status = UserStatus.ACTIVE;
        if (!user.roles?.some((r) => r.id === menteeRole.id)) {
          user.roles = [...(user.roles ?? []), menteeRole];
        }
      }
      user = await this.users.save(user);

      let profile = await this.mentees.findOne({ where: { userId: user.id } });
      if (!profile) {
        profile = this.mentees.create({ userId: user.id });
      }
      profile.learningGoals = [...m.goals];
      profile.areasOfInterest = [...m.interests];
      profile.skillLevel = m.level;
      profile.preferredMentoringStyle = ['1:1', 'async feedback'];
      profile.timeCommitmentHours = 2 + m.n;
      profile.professionalBackground = 'Demo mentee profile for local and staging use.';
      profile.jobTitle = 'Learner';
      profile.industry = 'Technology';
      await this.mentees.save(profile);
      mentees += 1;
    }

    this.logger.log(`Demo seed complete: ${mentors} mentors, ${mentees} mentees`);
    return { mentors, mentees };
  }
}
