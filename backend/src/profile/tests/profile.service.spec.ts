import { DuplicateResourceException } from '../../common/errors/app-exceptions';
import { ChangeReason } from '../../profile-history/profile-history.entity';
import { MenteeProfile } from '../mentee-profile.entity';
import { MentorProfile } from '../mentor-profile.entity';
import { CreateProfileDto, ProfileType } from '../dto/create-profile.dto';
import { ProfileService } from '../profile.service';

// ─── Stubs ────────────────────────────────────────────────────────────────────

const WALLET = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';

function makeMentorProfile(overrides: Partial<MentorProfile> = {}): MentorProfile {
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

function makeMenteeProfile(overrides: Partial<MenteeProfile> = {}): MenteeProfile {
  const p = new MenteeProfile();
  p.id = 'uuid-mentee';
  p.walletAddress = WALLET;
  p.learningGoals = 'I want to transition from backend to full-stack.';
  p.interests = ['React', 'System Design'];
  p.budgetUsdCentsPerMonth = null;
  p.experienceLevel = 'intermediate';
  p.languages = ['English'];
  p.isActive = true;
  p.createdAt = new Date('2024-06-01T00:00:00.000Z');
  p.updatedAt = new Date('2024-06-01T00:00:00.000Z');
  return Object.assign(p, overrides);
}

function makeMentorRepo(existing: MentorProfile | null = null) {
  return {
    findOneBy: jest.fn().mockResolvedValue(existing),
  };
}

function makeMenteeRepo(existing: MenteeProfile | null = null) {
  return {
    findOneBy: jest.fn().mockResolvedValue(existing),
  };
}

function makeDataSource(savedProfile: MentorProfile | MenteeProfile) {
  const manager = {
    create: jest.fn((_EntityClass: unknown, data: object) => ({ ...data })),
    save: jest.fn().mockResolvedValue(savedProfile),
    query: jest.fn().mockResolvedValue([]),
  };
  return {
    transaction: jest.fn(async (cb: (mgr: typeof manager) => Promise<unknown>) => cb(manager)),
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
  const service = new ProfileService(
    makeMentorRepo(mentorProfile) as never,
    makeMenteeRepo(menteeProfile) as never,
    ds as never,
    makeHistoryService() as never,
    makeCompleteness() as never,
  );
  return { service, ds };
}

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
    const roleQueries: string[] = (manager.query as jest.Mock).mock.calls.map(
      (c: [string]) => c[0],
    );
    expect(roleQueries.some((q) => q.includes('user_roles'))).toBe(true);
  });

  it('applies defaults: maxMentees=3, languages=["English"]', async () => {
    const saved = makeMentorProfile();
    const { service, ds } = makeService(null, null, saved);

    await service.createProfile(WALLET, MENTOR_DTO);

    const manager = ds._manager;
    const created = (manager.create as jest.Mock).mock.calls[0][1] as Partial<MentorProfile>;
    expect(created.maxMentees).toBe(3);
    expect(created.languages).toEqual(['English']);
  });

  it('uses provided optional fields when supplied', async () => {
    const saved = makeMentorProfile({ hourlyRateUsdCents: 5000, maxMentees: 5 });
    const { service, ds } = makeService(null, null, saved);

    await service.createProfile(WALLET, {
      ...MENTOR_DTO,
      hourlyRateUsdCents: 5000,
      maxMentees: 5,
      languages: ['English', 'Spanish'],
    });

    const manager = ds._manager;
    const created = (manager.create as jest.Mock).mock.calls[0][1] as Partial<MentorProfile>;
    expect(created.hourlyRateUsdCents).toBe(5000);
    expect(created.maxMentees).toBe(5);
    expect(created.languages).toEqual(['English', 'Spanish']);
  });

  it('throws DuplicateResourceException when a mentor profile already exists', async () => {
    const existing = makeMentorProfile();
    const { service } = makeService(existing, null, existing);

    await expect(service.createProfile(WALLET, MENTOR_DTO)).rejects.toBeInstanceOf(
      DuplicateResourceException,
    );
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
  learningGoals: 'I want to transition from backend to full-stack.',
  interests: ['React', 'System Design'],
  experienceLevel: 'intermediate',
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
    const roleQueries: string[] = (manager.query as jest.Mock).mock.calls.map(
      (c: [string]) => c[0],
    );
    expect(roleQueries.some((q) => q.includes('user_roles'))).toBe(true);
  });

  it('applies defaults: languages=["English"]', async () => {
    const saved = makeMenteeProfile();
    const { service, ds } = makeService(null, null, saved);

    await service.createProfile(WALLET, MENTEE_DTO);

    const manager = ds._manager;
    const created = (manager.create as jest.Mock).mock.calls[0][1] as Partial<MenteeProfile>;
    expect(created.languages).toEqual(['English']);
    expect(created.isActive).toBe(true);
  });

  it('throws DuplicateResourceException when a mentee profile already exists', async () => {
    const existing = makeMenteeProfile();
    const { service } = makeService(null, existing, existing);

    await expect(service.createProfile(WALLET, MENTEE_DTO)).rejects.toBeInstanceOf(
      DuplicateResourceException,
    );
  });

  it('allows a user to have both a mentor and a mentee profile', async () => {
    // The mentor repo returns an existing mentor profile,
    // but the mentee repo returns nothing — the mentee creation should succeed.
    const existingMentor = makeMentorProfile();
    const savedMentee = makeMenteeProfile();
    const { service } = makeService(existingMentor, null, savedMentee);

    const result = await service.createProfile(WALLET, MENTEE_DTO);

    expect(result.profileType).toBe(ProfileType.MENTEE);
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

    // recordMany is called with void — give it a tick to settle
    await new Promise((r) => setImmediate(r));

    expect(historyService.recordMany).toHaveBeenCalled();
    const entries = (historyService.recordMany as jest.Mock).mock.calls[0][0] as Array<{
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

    const entries = (historyService.recordMany as jest.Mock).mock.calls[0][0] as Array<{
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
