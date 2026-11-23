import {
  calculateProfileCompleteness,
  CompletenessInput,
} from '../profile-completeness.calculator';

const base: CompletenessInput = {
  profileType: 'mentor',
  profile: null,
  user: {},
  availabilitySlotCount: 0,
  portfolioLinkCount: 0,
};

const fullMentor: CompletenessInput = {
  profileType: 'mentor',
  profile: {
    bio: 'Experienced engineer',
    skills: ['TypeScript'],
    hourlyRateUsdCents: 5000,
    expertiseAreas: ['Backend'],
  },
  user: { avatarUrl: 'https://example.com/a.png' },
  availabilitySlotCount: 2,
  portfolioLinkCount: 1,
};

describe('calculateProfileCompleteness', () => {
  it('returns zero and every missing field for an empty mentor profile', () => {
    const result = calculateProfileCompleteness(base);
    expect(result.score).toBe(0);
    expect(result.baseScore).toBe(0);
    expect(result.missingFields.map((field) => field.field)).toEqual([
      'bio',
      'skills',
      'hourlyRateUsdCents',
      'expertiseAreas',
      'avatarUrl',
      'availabilitySlots',
    ]);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('scores a complete mentor profile at 100 and caps bonuses at 110', () => {
    const result = calculateProfileCompleteness({
      ...fullMentor,
      user: {
        ...fullMentor.user,
        education: ['BSc Computer Science'],
        certifications: ['AWS Certified'],
      },
    });
    expect(result.baseScore).toBe(100);
    expect(result.bonusPoints).toBe(10);
    expect(result.score).toBe(110);
    expect(result.missingFields).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });

  it('adds optional-field bonuses incrementally', () => {
    expect(calculateProfileCompleteness(fullMentor).bonusPoints).toBe(4);
    expect(
      calculateProfileCompleteness({ ...fullMentor, user: { ...fullMentor.user, education: ['BSc'] } })
        .bonusPoints,
    ).toBe(7);
  });

  it('treats empty arrays and blank strings as missing', () => {
    const result = calculateProfileCompleteness({
      profileType: 'mentee',
      profile: { learningGoals: '   ', interests: [], experienceLevel: '' },
      user: {},
      availabilitySlotCount: 0,
      portfolioLinkCount: 0,
    });
    expect(result.baseScore).toBe(0);
    expect(result.missingFields).toHaveLength(3);
  });

  it('uses the mentee field set and honours a custom suggestion threshold', () => {
    const result = calculateProfileCompleteness(
      {
        profileType: 'mentee',
        profile: { learningGoals: 'Learn NestJS', interests: ['Backend'], experienceLevel: null },
        user: {},
        availabilitySlotCount: 0,
        portfolioLinkCount: 0,
      },
      50,
    );
    expect(result.baseScore).toBe(67);
    expect(result.missingFields).toEqual([
      { field: 'skillLevel', description: 'Set your current skill level.' },
    ]);
    expect(result.suggestions).toEqual([]);
  });
});
