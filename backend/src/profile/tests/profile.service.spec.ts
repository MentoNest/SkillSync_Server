import { Keypair } from '@stellar/stellar-sdk';
import {
  DuplicateResourceException,
  ValidationFailedException,
} from '../../common/errors/app-exceptions';
import { Role, AuthUser } from '../../auth/auth.types';
import { ChangeReason } from '../../profile-history/profile-history.entity';
import { UserStatus } from '../../user/user-status.enum';
import { MenteeProfile, SkillLevel } from '../mentee-profile.entity';
import { MentorProfile } from '../mentor-profile.entity';
import { CreateProfileDto, ProfileType } from '../dto/create-profile.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ProfileService } from '../profile.service';

const WALLET = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
const OTHER_WALLET = Keypair.random().publicKey().toLowerCase();

function makeMentorProfile(
  overrides: Partial<MentorProfile> = {},
): MentorProfile {
  const p = new MentorProfile();
  p.id = 'uuid-mentor';
  p.walletAddress = WALLET;
  p.bio = 'Senior engineer with 10 years in distributed systems.';
  p.skills = ['TypeScript', 'NestJS'];
  p.hourlyRateUsdCents = null;
  p.maxMentees = 3;
  p.languages = ['English'];
  p.isActive = true;
  p.createdAt = new Date('2024-06-01T00:00:00.000Z');
  p.updatedAt = new Date('2024-06-01T00:00:00.000Z');
  return Object.assign(p, overrides);
}

function makeMenteeProfile(
  overrides: Partial<MenteeProfile> = {},
): MenteeProfile {
  const p = new MenteeProfile();
  p.id = 'uuid-mentee';
  p.walletAddress = WALLET;
  p.learningGoals = ['I want to transition from backend to full-stack.'];
  p.interests = ['React', 'System Design'];
  p.budgetUsdCentsPerMonth = null;
  p.experienceLevel = SkillLevel.INTERMEDIATE;
  p.preferredMentoringStyle = ['technical skills'];
  p.timeCommitmentHoursPerWeek = 5;
  p.professionalBackground = 'Backend engineer';
  p.jobTitle = null;
  p.industry = null;
  p.portfolioLinks = [];
  p.languages = ['English'];
  p.isActive = true;
  p.createdAt = new Date('2024-06-01T00:00:00.000Z');
  p.updatedAt = new Date('2024-06-01T00:00:00.000Z');
  return Object.assign(p, overrides);
}

function makeMentorRepo(existing: MentorProfile | null = null) {
  return {
    findOneBy: jest.fn().mockResolvedValue(existing),
    save: jest.fn(async (profile: MentorProfile) => profile),
  };
}

function makeMenteeRepo(existing: MenteeProfile | null = null) {
  return {
    findOneBy: jest.fn().mockResolvedValue(existing),
    save: jest.fn(async (profile: MenteeProfile) => profile),
    delete: jest.fn().mockResolvedValue({ affected: existing ? 1 : 0 }),
  };
}

function makeDataSource(savedProfile: MentorProfile | MenteeProfile) {
  const manager = {
    create: jest.fn((_EntityClass: unknown, data: object) => ({ ...data })),
    save: jest.fn().mockResolvedValue(savedProfile),
    query: jest.fn().mockResolvedValue([]),
  };
  return {
    transaction: jest.fn(
      async (cb: (mgr: typeof manager) => Promise<unknown>) => cb(manager),
    ),
    query: jest.fn().mockResolvedValue([]),
    _manager: manager,
  };
}

function makeHistoryService() {
  return {
    record: jest.fn().mockResolvedValue(undefined),
    recordMany: jest.fn().mockResolvedValue(undefined),
  };
}

const makeCompleteness = () => ({
  getForUser: jest.fn().mockResolvedValue({ score: 0 }),
  invalidate: jest.fn().mockResolvedValue(undefined),
});

function makeService(
  mentorProfile: MentorProfile | null,
  menteeProfile: MenteeProfile | null,
  savedProfile: MentorProfile | MenteeProfile,
) {
  const ds = makeDataSource(savedProfile);
  const mentorRepo = makeMentorRepo(mentorProfile);
  const menteeRepo = makeMenteeRepo(menteeProfile);
  const history = makeHistoryService();
  const completeness = makeCompleteness();
  const service = new ProfileService(
    mentorRepo as never,
    menteeRepo as never,
    ds as never,
    history as never,
    completeness as never,
  );
  return { service, ds, mentorRepo, menteeRepo, history, completeness };
}

const user = (address = WALLET, roles: Role[] = [Role.USER]): AuthUser => ({
  address,
  roles,
  status: UserStatus.ACTIVE,
  jti: 'test-jti',
});

// ─── Mentor creation ──────────────────────────────────────────────────────────

const MENTOR_DTO: CreateProfileDto = {
  profileType: ProfileType.MENTOR,
  bio: 'Senior engineer with 10 years in distributed systems.',
  skills: ['TypeScript', 'NestJS'],
};

describe('ProfileService.createProfile — mentor', () => {
  it('returns the created profile with profileType', async () => {
    const saved = makeMentorProfile();
    const { service } = makeService(null, null, saved);

    const result = await service.createProfile(WALLET, MENTOR_DTO);

    expect(result.profileType).toBe(ProfileType.MENTOR);
    expect(result.profile).toBe(saved);
  });

  it('runs the insert inside a transaction', async () => {
    const saved = makeMentorProfile();
    const { service, ds } = makeService(null, null, saved);

    await service.createProfile(WALLET, MENTOR_DTO);

    expect(ds.transaction).toHaveBeenCalledTimes(1);
  });

  it('inserts the user_roles row for the mentor role', async () => {
    const saved = makeMentorProfile();
    const { service, ds } = makeService(null, null, saved);

    await service.createProfile(WALLET, MENTOR_DTO);

    const manager = ds._manager;
    const roleQueries: string[] = manager.query.mock.calls.map(
      (c: [string]) => c[0],
    );
    expect(roleQueries.some((q) => q.includes('user_roles'))).toBe(true);
  });

  it('applies defaults: maxMentees=3, languages=["English"]', async () => {
    const saved = makeMentorProfile();
    const { service, ds } = makeService(null, null, saved);

    await service.createProfile(WALLET, MENTOR_DTO);

    const manager = ds._manager;
    const created = (manager.create as jest.Mock).mock
      .calls[0][1] as Partial<MentorProfile>;
    expect(created.maxMentees).toBe(3);
    expect(created.languages).toEqual(['English']);
  });

  it('uses provided optional fields when supplied', async () => {
    const saved = makeMentorProfile({
      hourlyRateUsdCents: 5000,
      maxMentees: 5,
    });
    const { service, ds } = makeService(null, null, saved);

    await service.createProfile(WALLET, {
      ...MENTOR_DTO,
      hourlyRateUsdCents: 5000,
      maxMentees: 5,
      languages: ['English', 'Spanish'],
    });

    const manager = ds._manager;
    const created = (manager.create as jest.Mock).mock
      .calls[0][1] as Partial<MentorProfile>;
    expect(created.hourlyRateUsdCents).toBe(5000);
    expect(created.maxMentees).toBe(5);
    expect(created.languages).toEqual(['English', 'Spanish']);
  });

  it('throws DuplicateResourceException when a mentor profile already exists', async () => {
    const existing = makeMentorProfile();
    const { service } = makeService(existing, null, existing);

    await expect(
      service.createProfile(WALLET, MENTOR_DTO),
    ).rejects.toBeInstanceOf(DuplicateResourceException);
  });

  it('does not run a transaction when the duplicate check fails', async () => {
    const existing = makeMentorProfile();
    const { service, ds } = makeService(existing, null, existing);

    await expect(service.createProfile(WALLET, MENTOR_DTO)).rejects.toThrow();
    expect(ds.transaction).not.toHaveBeenCalled();
  });
});

// ─── Mentee creation ──────────────────────────────────────────────────────────

const MENTEE_DTO: CreateProfileDto = {
  profileType: ProfileType.MENTEE,
  learningGoals: ['I want to transition from backend to full-stack.'],
  interests: ['React', 'System Design'],
  experienceLevel: SkillLevel.INTERMEDIATE,
  preferredMentoringStyle: ['technical skills', 'career advice'],
  timeCommitmentHoursPerWeek: 5,
  professionalBackground: 'Backend engineer',
};

describe('ProfileService.createProfile — mentee', () => {
  it('returns the created profile with profileType', async () => {
    const saved = makeMenteeProfile();
    const { service } = makeService(null, null, saved);

    const result = await service.createProfile(WALLET, MENTEE_DTO);

    expect(result.profileType).toBe(ProfileType.MENTEE);
    expect(result.profile).toBe(saved);
  });

  it('inserts the user_roles row for the mentee role', async () => {
    const saved = makeMenteeProfile();
    const { service, ds } = makeService(null, null, saved);

    await service.createProfile(WALLET, MENTEE_DTO);

    const manager = ds._manager;
    const roleQueries: string[] = manager.query.mock.calls.map(
      (c: [string]) => c[0],
    );
    expect(roleQueries.some((q) => q.includes('user_roles'))).toBe(true);
  });

  it('applies defaults: languages=["English"]', async () => {
    const saved = makeMenteeProfile();
    const { service, ds } = makeService(null, null, saved);

    await service.createProfile(WALLET, MENTEE_DTO);

    const manager = ds._manager;
    const created = (manager.create as jest.Mock).mock
      .calls[0][1] as Partial<MenteeProfile>;
    expect(created.languages).toEqual(['English']);
    expect(created.isActive).toBe(true);
  });

  it('throws DuplicateResourceException when a mentee profile already exists', async () => {
    const existing = makeMenteeProfile();
    const { service } = makeService(null, existing, existing);

    await expect(
      service.createProfile(WALLET, MENTEE_DTO),
    ).rejects.toBeInstanceOf(DuplicateResourceException);
  });

  it('allows a user to have both a mentor and a mentee profile', async () => {
    const existingMentor = makeMentorProfile();
    const savedMentee = makeMenteeProfile();
    const { service } = makeService(existingMentor, null, savedMentee);

    const result = await service.createProfile(WALLET, MENTEE_DTO);

    expect(result.profileType).toBe(ProfileType.MENTEE);
  });
});

// ─── Dedicated Mentee CRUD (role-restricted) ──────────────────────────────────

describe('ProfileService — dedicated mentee CRUD', () => {
  it('forbids users without the mentee role from accessing mentee CRUD operations', async () => {
    const saved = makeMenteeProfile();
    const { service } = makeService(null, saved, saved);

    await expect(service.getMenteeProfile(user())).rejects.toThrow(
      'Only users with the mentee role can access mentee profiles.',
    );
    await expect(service.deleteMenteeProfile(user())).rejects.toThrow(
      'Only users with the mentee role can access mentee profiles.',
    );
  });

  it('returns mentee profile with completionPercentage for mentee role users', async () => {
    const saved = makeMenteeProfile();
    const { service } = makeService(null, saved, saved);

    const res = await service.getMenteeProfile(
      user(WALLET, [Role.USER, Role.MENTEE]),
    );
    expect(res.profile).toBe(saved);
    expect(res.completionPercentage).toBe(100);
    expect(res.missingFields).toEqual([]);
  });

  it('deletes mentee profile and invalidates completeness cache', async () => {
    const saved = makeMenteeProfile();
    const { service, menteeRepo, completeness } = makeService(
      null,
      saved,
      saved,
    );

    await service.deleteMenteeProfile(user(WALLET, [Role.USER, Role.MENTEE]));
    expect(menteeRepo.delete).toHaveBeenCalledWith({
      walletAddress: WALLET.toLowerCase(),
    });
    expect(completeness.invalidate).toHaveBeenCalledWith(WALLET.toLowerCase());
  });
});

// ─── Audit history ────────────────────────────────────────────────────────────

describe('ProfileService — audit history', () => {
  it('calls recordMany after a successful mentor profile creation', async () => {
    const saved = makeMentorProfile();
    const historyService = makeHistoryService();
    const ds = makeDataSource(saved);
    const service = new ProfileService(
      makeMentorRepo(null) as never,
      makeMenteeRepo(null) as never,
      ds as never,
      historyService as never,
      makeCompleteness() as never,
    );

    await service.createProfile(WALLET, MENTOR_DTO);
    await new Promise((r) => setImmediate(r));

    expect(historyService.recordMany).toHaveBeenCalled();
    const entries = historyService.recordMany.mock.calls[0][0] as Array<{
      userId: string;
      profileType: string;
      changeReason: ChangeReason;
    }>;
    expect(entries[0].userId).toBe(WALLET);
    expect(entries[0].profileType).toBe('mentor');
    expect(entries[0].changeReason).toBe(ChangeReason.USER_EDIT);
  });

  it('calls recordMany after a successful mentee profile creation', async () => {
    const saved = makeMenteeProfile();
    const historyService = makeHistoryService();
    const ds = makeDataSource(saved);
    const service = new ProfileService(
      makeMentorRepo(null) as never,
      makeMenteeRepo(null) as never,
      ds as never,
      historyService as never,
      makeCompleteness() as never,
    );

    await service.createProfile(WALLET, MENTEE_DTO);
    await new Promise((r) => setImmediate(r));

    const entries = historyService.recordMany.mock.calls[0][0] as Array<{
      profileType: string;
    }>;
    expect(entries[0].profileType).toBe('mentee');
  });

  it('does not call recordMany when duplicate check throws', async () => {
    const existing = makeMentorProfile();
    const historyService = makeHistoryService();
    const ds = makeDataSource(existing);
    const service = new ProfileService(
      makeMentorRepo(existing) as never,
      makeMenteeRepo(null) as never,
      ds as never,
      historyService as never,
      makeCompleteness() as never,
    );

    await expect(service.createProfile(WALLET, MENTOR_DTO)).rejects.toThrow();
    await new Promise((r) => setImmediate(r));

    expect(historyService.recordMany).not.toHaveBeenCalled();
  });
});

describe('ProfileService.updateProfile', () => {
  it('rejects attempts to update another user profile by a non-admin', async () => {
    const saved = makeMenteeProfile();
    const { service, menteeRepo } = makeService(null, saved, saved);

    await expect(
      service.updateProfile(ProfileType.MENTEE, user(), {
        walletAddress: OTHER_WALLET,
        learningGoals: ['A new learning goal for this user.'],
      }),
    ).rejects.toThrow('You can only update your own profile.');
    expect(menteeRepo.findOneBy).not.toHaveBeenCalled();
  });

  it('requires the mentor role for mentor profile updates', async () => {
    const saved = makeMentorProfile();
    const { service, ds, mentorRepo } = makeService(saved, null, saved);

    await expect(
      service.updateProfile(ProfileType.MENTOR, user(), {
        bio: 'A different bio for this profile.',
      }),
    ).rejects.toThrow(
      'Only users with the mentor role can update a mentor profile.',
    );
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM user_roles'),
      [WALLET.toLowerCase(), Role.MENTOR],
    );
    expect(mentorRepo.findOneBy).not.toHaveBeenCalled();
  });

  it('requires the mentee role for mentee profile updates', async () => {
    const saved = makeMenteeProfile();
    const { service, ds, menteeRepo } = makeService(null, saved, saved);

    await expect(
      service.updateProfile(ProfileType.MENTEE, user(), {
        learningGoals: ['Updated goal for mentee'],
      }),
    ).rejects.toThrow(
      'Only users with the mentee role can update a mentee profile.',
    );
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM user_roles'),
      [WALLET.toLowerCase(), Role.MENTEE],
    );
    expect(menteeRepo.findOneBy).not.toHaveBeenCalled();
  });

  it('updates only supplied fields and records old/new values', async () => {
    const saved = makeMentorProfile();
    const { service, mentorRepo, history, completeness } = makeService(
      saved,
      null,
      saved,
    );
    const dto: UpdateProfileDto = {
      bio: 'A new professional biography for the profile.',
    };

    const result = await service.updateProfile(
      ProfileType.MENTOR,
      user(WALLET, [Role.USER, Role.MENTOR]),
      dto,
    );

    expect(result.profileType).toBe(ProfileType.MENTOR);
    expect(result.profile).toBe(saved);
    expect(saved.bio).toBe(dto.bio);
    expect(mentorRepo.save).toHaveBeenCalledWith(saved);
    expect(history.recordMany).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: WALLET.toLowerCase(),
        profileType: ProfileType.MENTOR,
        fieldName: 'bio',
        oldValue: 'Senior engineer with 10 years in distributed systems.',
        newValue: dto.bio,
        changedBy: WALLET.toLowerCase(),
        changeReason: ChangeReason.USER_EDIT,
      }),
    ]);
    expect(completeness.invalidate).toHaveBeenCalledWith(WALLET.toLowerCase());
  });

  it('rejects fields that do not belong to the requested profile type', async () => {
    const saved = makeMentorProfile();
    const { service, mentorRepo } = makeService(saved, null, saved);

    await expect(
      service.updateProfile(
        ProfileType.MENTOR,
        user(WALLET, [Role.USER, Role.MENTOR]),
        { learningGoals: ['A new learning goal for this user.'] },
      ),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(mentorRepo.save).not.toHaveBeenCalled();
  });

  it('allows admins to update another user and records an admin audit reason', async () => {
    const targetAddress = OTHER_WALLET;
    const saved = makeMenteeProfile({ walletAddress: targetAddress });
    const { service, history } = makeService(null, saved, saved);

    await service.updateProfile(
      ProfileType.MENTEE,
      user(WALLET, [Role.USER, Role.ADMIN]),
      {
        walletAddress: targetAddress,
        learningGoals: ['A new learning goal for this user.'],
      },
    );

    expect(history.recordMany).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: targetAddress,
        changedBy: WALLET.toLowerCase(),
        changeReason: ChangeReason.ADMIN_EDIT,
      }),
    ]);
  });

  it('does not save or increment profile state for an unchanged patch', async () => {
    const saved = makeMentorProfile();
    const { service, mentorRepo, history, completeness } = makeService(
      saved,
      null,
      saved,
    );

    await service.updateProfile(
      ProfileType.MENTOR,
      user(WALLET, [Role.USER, Role.MENTOR]),
      { bio: saved.bio },
    );

    expect(mentorRepo.save).not.toHaveBeenCalled();
    expect(history.recordMany).not.toHaveBeenCalled();
    expect(completeness.invalidate).not.toHaveBeenCalled();
  });
});
