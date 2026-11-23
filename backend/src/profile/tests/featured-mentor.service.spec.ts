import { BusinessRuleException, ResourceNotFoundException } from '../../common/errors/app-exceptions';
import { AppConfig } from '../../config/app.config';
import { MentorProfile } from '../mentor-profile.entity';
import { FeaturedMentorService } from '../featured-mentor.service';

const WALLET = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
const ADMIN = 'GADMINADMINADMINADMINADMINADMINADMINADMINADMINADMINADM';

function mentor(over: Partial<MentorProfile> = {}): MentorProfile {
  const profile = new MentorProfile();
  Object.assign(profile, {
    id: 'mentor-uuid',
    walletAddress: WALLET,
    bio: 'Senior engineer with years of experience',
    skills: ['TypeScript'],
    expertiseAreas: ['Backend'],
    hourlyRateUsdCents: 5000,
    isFeatured: false,
    featuredAt: null,
    featuredOrder: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  });
  return Object.assign(profile, over);
}

function makeService(options: { existing?: MentorProfile | null; count?: number; max?: number } = {}) {
  const profile = options.existing === undefined ? mentor() : options.existing;
  const qb = {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ max: options.count ?? 0 }),
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  const manager = {
    findOne: jest.fn().mockResolvedValue(profile),
    count: jest.fn().mockResolvedValue(options.count ?? 0),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
  const mentors = {
    findAndCount: jest.fn().mockResolvedValue([[profile], 1]),
    update: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  const history = { recordMany: jest.fn().mockResolvedValue(undefined) };
  const config = {
    featuredMentors: { max: options.max ?? 10, durationDays: 30 },
  } as AppConfig;
  const service = new FeaturedMentorService(
    mentors as never,
    { transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)) } as never,
    history as never,
    config,
  );
  return { service, mentors, manager, qb, history };
}

describe('FeaturedMentorService', () => {
  it('features a mentor at the next order and writes an audit entry', async () => {
    const { service, manager, history } = makeService({ count: 2 });

    const result = await service.featureMentor('mentor-uuid', ADMIN);

    expect(result).toMatchObject({ isFeatured: true, badge: 'Featured', featuredOrder: 3 });
    expect(manager.update).toHaveBeenCalledWith(
      MentorProfile,
      'mentor-uuid',
      expect.objectContaining({ isFeatured: true }),
    );
    expect(history.recordMany).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ changedBy: ADMIN, fieldName: 'isFeatured' })]),
    );
  });

  it('refuses to exceed the configured maximum', async () => {
    const { service } = makeService({ count: 2, max: 2 });
    await expect(service.featureMentor('mentor-uuid', ADMIN)).rejects.toBeInstanceOf(
      BusinessRuleException,
    );
  });

  it('clears feature fields on unfeature', async () => {
    const { service, manager } = makeService({
      existing: mentor({ isFeatured: true, featuredAt: new Date(), featuredOrder: 1 }),
    });

    const result = await service.unfeatureMentor('mentor-uuid', ADMIN);

    expect(result).toEqual({ walletAddress: WALLET, isFeatured: false });
    expect(manager.update).toHaveBeenCalledWith(
      MentorProfile,
      'mentor-uuid',
      { isFeatured: false, featuredAt: null, featuredOrder: null },
    );
  });

  it('reports a missing mentor', async () => {
    const { service } = makeService({ existing: null });
    await expect(service.featureMentor('missing', ADMIN)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });

  it('expires stale features on public reads and maps the badge DTO', async () => {
    const { service, mentors } = makeService({
      existing: mentor({ isFeatured: true, featuredAt: new Date(), featuredOrder: 1 }),
    });

    const page = await service.getFeaturedMentors({ page: 1, limit: 10 });

    expect(mentors.update).toHaveBeenCalledWith(
      { isFeatured: true, featuredAt: expect.anything() },
      { isFeatured: false, featuredAt: null, featuredOrder: null },
    );
    expect(page).toMatchObject({ total: 1, page: 1, limit: 10 });
    expect(page.data[0]).toMatchObject({ badge: 'Featured', isFeatured: true, displayName: WALLET.slice(0, 8) });
  });

  it('treats features older than the configured duration as inactive', () => {
    const { service } = makeService();
    const old = mentor({ isFeatured: true, featuredAt: new Date(Date.now() - 31 * 86_400_000) });
    const fresh = mentor({ isFeatured: true, featuredAt: new Date() });
    expect(service.isFeatureActive(old)).toBe(false);
    expect(service.isFeatureActive(fresh)).toBe(true);
  });
});
