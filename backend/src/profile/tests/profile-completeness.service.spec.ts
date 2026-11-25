import { ResourceNotFoundException } from '../../common/errors/app-exceptions';
import { AppConfig } from '../../config/app.config';
import { ProfileCompletenessService } from '../profile-completeness.service';

const WALLET = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';

function makeService(user: unknown = null) {
  const store = new Map<string, string>();
  const redis = {
    get: jest.fn(
      async (ns: string, key: string) => store.get(`${ns}:${key}`) ?? null,
    ),
    set: jest.fn(async (ns: string, key: string, value: string) => {
      store.set(`${ns}:${key}`, value);
    }),
    del: jest.fn(async (ns: string, key: string) =>
      store.delete(`${ns}:${key}`) ? 1 : 0,
    ),
  };
  const users = {
    findOne: jest.fn().mockResolvedValue(user),
    findAndCount: jest.fn().mockResolvedValue([[{ walletAddress: WALLET }], 1]),
  };
  const slots = { count: jest.fn().mockResolvedValue(1) };
  const links = { count: jest.fn().mockResolvedValue(1) };
  const config = {
    profileCompleteness: { cacheTtlSeconds: 300, minimumSuggestionScore: 80 },
  } as AppConfig;
  const service = new ProfileCompletenessService(
    users as never,
    slots as never,
    links as never,
    redis as never,
    config,
  );
  return { service, redis, users, slots, links };
}

const mentorUser = {
  walletAddress: WALLET,
  avatarUrl: 'https://example.com/avatar.png',
  education: ['BSc'],
  certifications: [],
  mentorProfile: {
    bio: 'Senior engineer',
    skills: ['TypeScript'],
    hourlyRateUsdCents: 5000,
    expertiseAreas: ['Backend'],
  },
  menteeProfile: null,
};

describe('ProfileCompletenessService', () => {
  it('computes, caches and reuses the score for five minutes', async () => {
    const { service, redis, users } = makeService(mentorUser);

    const first = await service.getForUser(WALLET);
    const second = await service.getForUser(WALLET);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.score).toBe(first.score);
    expect(redis.set).toHaveBeenCalledWith(
      'cache',
      `completeness:${WALLET}`,
      expect.any(String),
      300,
    );
    expect(users.findOne).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cached score after a profile change', async () => {
    const { service, redis } = makeService(mentorUser);
    await service.getForUser(WALLET);
    await service.invalidate(WALLET);

    expect(redis.del).toHaveBeenCalledWith('cache', `completeness:${WALLET}`);
    expect((await service.getForUser(WALLET)).cached).toBe(false);
  });

  it('returns a list of scores for administrators', async () => {
    const { service } = makeService(mentorUser);
    const page = await service.getAll({ page: 1, limit: 10 });

    expect(page.total).toBe(1);
    expect(page.data[0]).toMatchObject({
      walletAddress: WALLET,
      profileType: 'mentor',
    });
  });

  it('throws when the wallet does not exist', async () => {
    const { service } = makeService(null);
    await expect(service.computeForUser(WALLET)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });
});
