import { FeaturedMentorDto } from '../../profile/dto/featured-mentor.dto';
import { MentorProfile } from '../../profile/mentor-profile.entity';
import { User } from '../user.entity';
import { UserService } from '../user.service';

const WALLET = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
const VERIFIED_AT = new Date('2026-01-02T03:04:05.000Z');

function makeVerifiedUser(): User {
  const mentorProfile = Object.assign(new MentorProfile(), {
    walletAddress: WALLET,
    isFeatured: false,
    isVerified: true,
    verifiedAt: VERIFIED_AT,
    verificationNotes: 'Internal review note',
  });
  return Object.assign(new User(), {
    walletAddress: WALLET,
    username: 'verified-mentor',
    displayName: 'Verified Mentor',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    mentorProfile,
  });
}

describe('mentor verification response fields', () => {
  it('includes the verified badge and timestamp in public profile and search responses', async () => {
    const user = makeVerifiedUser();
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(user),
      getManyAndCount: jest.fn().mockResolvedValue([[user], 1]),
    };
    const service = new UserService(
      { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } as never,
      { listByWallet: jest.fn().mockResolvedValue([]) } as never,
      { getForUser: jest.fn().mockResolvedValue({ score: 0 }) } as never,
    );

    const profile = await service.getPublicProfile('verified-mentor');
    const search = await service.findAll({
      search: 'verified',
      page: 1,
      limit: 10,
    });

    expect(profile).toMatchObject({
      isVerified: true,
      verifiedBadge: 'Verified',
      verifiedAt: VERIFIED_AT.toISOString(),
    });
    expect(profile).not.toHaveProperty('verificationNotes');
    expect(search.data[0]).toMatchObject({
      isVerified: true,
      verifiedBadge: 'Verified',
      verifiedAt: VERIFIED_AT,
    });
  });

  it('includes the verified badge and timestamp on featured mentor cards', () => {
    const profile = makeVerifiedUser().mentorProfile;
    if (!profile)
      throw new Error('Expected the verified user to have a mentor profile.');
    Object.assign(profile, {
      bio: 'A mentor bio',
      skills: ['TypeScript'],
      hourlyRateUsdCents: null,
      updatedAt: VERIFIED_AT,
      featuredAt: VERIFIED_AT,
      featuredOrder: 1,
      isFeatured: true,
      user: makeVerifiedUser(),
    });

    expect(FeaturedMentorDto.fromEntity(profile)).toMatchObject({
      isVerified: true,
      verifiedBadge: 'Verified',
      verifiedAt: VERIFIED_AT,
    });
  });
});
