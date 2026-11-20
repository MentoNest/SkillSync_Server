import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProfileDto, ProfileType } from '../dto/create-profile.dto';

async function validateDto(plain: object): Promise<string[]> {
  const dto = plainToInstance(CreateProfileDto, plain);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: false });
  return errors.flatMap((e) =>
    Object.values(e.constraints ?? {}).concat(
      (e.children ?? []).flatMap((c) => Object.values(c.constraints ?? {})),
    ),
  );
}

// ─── profileType ─────────────────────────────────────────────────────────────

describe('CreateProfileDto — profileType', () => {
  it('rejects a missing profileType', async () => {
    const errs = await validateDto({ bio: 'x'.repeat(10), skills: ['TS'] });
    expect(errs.some((e) => e.includes('mentor') || e.includes('mentee'))).toBe(true);
  });

  it('rejects an unknown profileType', async () => {
    const errs = await validateDto({ profileType: 'admin', bio: 'x'.repeat(10), skills: ['TS'] });
    expect(errs.length).toBeGreaterThan(0);
  });
});

// ─── Mentor validation ────────────────────────────────────────────────────────

const VALID_MENTOR = {
  profileType: ProfileType.MENTOR,
  bio: 'Senior engineer with 10 years in distributed systems.',
  skills: ['TypeScript', 'NestJS'],
};

describe('CreateProfileDto — mentor', () => {
  it('passes for a minimal valid mentor payload', async () => {
    expect(await validateDto(VALID_MENTOR)).toHaveLength(0);
  });

  it('passes with all optional mentor fields', async () => {
    const errs = await validateDto({
      ...VALID_MENTOR,
      hourlyRateUsdCents: 5000,
      maxMentees: 5,
      languages: ['English', 'Spanish'],
    });
    expect(errs).toHaveLength(0);
  });

  it('rejects a missing bio', async () => {
    const errs = await validateDto({ profileType: ProfileType.MENTOR, skills: ['TS'] });
    expect(errs.some((e) => /bio/i.test(e))).toBe(true);
  });

  it('rejects a bio shorter than 10 characters', async () => {
    const errs = await validateDto({ ...VALID_MENTOR, bio: 'short' });
    expect(errs.some((e) => /bio/i.test(e))).toBe(true);
  });

  it('rejects a bio longer than 500 characters', async () => {
    const errs = await validateDto({ ...VALID_MENTOR, bio: 'x'.repeat(501) });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects empty skills array', async () => {
    const errs = await validateDto({ ...VALID_MENTOR, skills: [] });
    expect(errs.some((e) => /skills/i.test(e))).toBe(true);
  });

  it('rejects skills with more than 20 entries', async () => {
    const errs = await validateDto({
      ...VALID_MENTOR,
      skills: Array.from({ length: 21 }, (_, i) => `Skill${i}`),
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects a skill name longer than 64 characters', async () => {
    const errs = await validateDto({ ...VALID_MENTOR, skills: ['x'.repeat(65)] });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects a negative hourlyRateUsdCents', async () => {
    const errs = await validateDto({ ...VALID_MENTOR, hourlyRateUsdCents: -1 });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects hourlyRateUsdCents above 100 000', async () => {
    const errs = await validateDto({ ...VALID_MENTOR, hourlyRateUsdCents: 100_001 });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('allows null hourlyRateUsdCents (free / negotiate)', async () => {
    const errs = await validateDto({ ...VALID_MENTOR, hourlyRateUsdCents: null });
    expect(errs).toHaveLength(0);
  });

  it('rejects maxMentees = 0', async () => {
    const errs = await validateDto({ ...VALID_MENTOR, maxMentees: 0 });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects maxMentees > 20', async () => {
    const errs = await validateDto({ ...VALID_MENTOR, maxMentees: 21 });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('does NOT require mentee-only fields when profileType is mentor', async () => {
    // learningGoals and interests are absent — that's fine
    const errs = await validateDto(VALID_MENTOR);
    expect(errs).toHaveLength(0);
  });
});

// ─── Mentee validation ────────────────────────────────────────────────────────

const VALID_MENTEE = {
  profileType: ProfileType.MENTEE,
  learningGoals: 'I want to transition from backend to full-stack.',
  interests: ['React', 'System Design'],
  experienceLevel: 'intermediate',
};

describe('CreateProfileDto — mentee', () => {
  it('passes for a minimal valid mentee payload', async () => {
    expect(await validateDto(VALID_MENTEE)).toHaveLength(0);
  });

  it('passes with all optional mentee fields', async () => {
    const errs = await validateDto({
      ...VALID_MENTEE,
      budgetUsdCentsPerMonth: 10000,
      languages: ['English'],
    });
    expect(errs).toHaveLength(0);
  });

  it('rejects a missing learningGoals', async () => {
    const errs = await validateDto({
      profileType: ProfileType.MENTEE,
      interests: ['React'],
      experienceLevel: 'beginner',
    });
    expect(errs.some((e) => /learningGoals/i.test(e))).toBe(true);
  });

  it('rejects learningGoals shorter than 10 characters', async () => {
    const errs = await validateDto({ ...VALID_MENTEE, learningGoals: 'too short' });
    expect(errs.some((e) => /learningGoals/i.test(e))).toBe(true);
  });

  it('rejects empty interests array', async () => {
    const errs = await validateDto({ ...VALID_MENTEE, interests: [] });
    expect(errs.some((e) => /interests/i.test(e))).toBe(true);
  });

  it('rejects an invalid experienceLevel', async () => {
    const errs = await validateDto({ ...VALID_MENTEE, experienceLevel: 'expert' });
    expect(errs.some((e) => /experienceLevel/i.test(e))).toBe(true);
  });

  it('accepts all three valid experienceLevels', async () => {
    for (const level of ['beginner', 'intermediate', 'advanced']) {
      const errs = await validateDto({ ...VALID_MENTEE, experienceLevel: level });
      expect(errs).toHaveLength(0);
    }
  });

  it('rejects a negative budget', async () => {
    const errs = await validateDto({ ...VALID_MENTEE, budgetUsdCentsPerMonth: -100 });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('allows null budgetUsdCentsPerMonth', async () => {
    const errs = await validateDto({ ...VALID_MENTEE, budgetUsdCentsPerMonth: null });
    expect(errs).toHaveLength(0);
  });

  it('does NOT require mentor-only fields when profileType is mentee', async () => {
    const errs = await validateDto(VALID_MENTEE);
    expect(errs).toHaveLength(0);
  });
});

// ─── Shared languages ─────────────────────────────────────────────────────────

describe('CreateProfileDto — languages (shared)', () => {
  it('rejects an empty languages array', async () => {
    const errs = await validateDto({ ...VALID_MENTOR, languages: [] });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rejects more than 10 languages', async () => {
    const errs = await validateDto({
      ...VALID_MENTOR,
      languages: Array.from({ length: 11 }, (_, i) => `Lang${i}`),
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('allows languages to be omitted entirely', async () => {
    const errs = await validateDto(VALID_MENTOR);
    expect(errs).toHaveLength(0);
  });
});
