export type ProfileType = 'mentor' | 'mentee';

export interface ProfileCompletenessInput {
  profileType: ProfileType;
  bio?: string | null;
  skills?: string[] | null;
  hourlyRate?: number | null;
  expertiseAreas?: string[] | null;
  avatarUrl?: string | null;
  availabilitySlots?: number | null;
  learningGoals?: string[] | null;
  skillLevel?: string | null;
  areasOfInterest?: string[] | null;
  portfolioLinks?: number | null;
  education?: unknown[] | null;
  certifications?: unknown[] | null;
}

export interface MissingField {
  field: string;
  description: string;
}

export interface CompletenessResult {
  profileType: ProfileType;
  score: number;
  bonus: number;
  missing: MissingField[];
  suggestions: string[];
}

interface FieldRule {
  field: keyof ProfileCompletenessInput;
  description: string;
  filled: (input: ProfileCompletenessInput) => boolean;
}

const nonEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return value > 0;
  return Boolean(value);
};

const MENTOR_REQUIRED: FieldRule[] = [
  { field: 'bio', description: 'A short biography', filled: (i) => nonEmpty(i.bio) },
  { field: 'skills', description: 'At least one skill', filled: (i) => nonEmpty(i.skills) },
  { field: 'hourlyRate', description: 'An hourly rate greater than zero', filled: (i) => nonEmpty(i.hourlyRate) },
  { field: 'expertiseAreas', description: 'Expertise areas', filled: (i) => nonEmpty(i.expertiseAreas) },
  { field: 'avatarUrl', description: 'A profile avatar', filled: (i) => nonEmpty(i.avatarUrl) },
  {
    field: 'availabilitySlots',
    description: 'At least one availability slot',
    filled: (i) => nonEmpty(i.availabilitySlots),
  },
];

const MENTEE_REQUIRED: FieldRule[] = [
  { field: 'learningGoals', description: 'Learning goals', filled: (i) => nonEmpty(i.learningGoals) },
  { field: 'skillLevel', description: 'Your current skill level', filled: (i) => nonEmpty(i.skillLevel) },
  { field: 'areasOfInterest', description: 'Areas of interest', filled: (i) => nonEmpty(i.areasOfInterest) },
];

/**
 * Score = filled/total required * 100, plus up to +10 bonus for optional fields
 * (portfolio links, education, certifications). Capped at 110.
 */
export function computeCompleteness(input: ProfileCompletenessInput): CompletenessResult {
  const rules = input.profileType === 'mentor' ? MENTOR_REQUIRED : MENTEE_REQUIRED;
  const missing: MissingField[] = [];
  let filledCount = 0;
  for (const rule of rules) {
    if (rule.filled(input)) filledCount += 1;
    else missing.push({ field: rule.field, description: rule.description });
  }

  const base = rules.length ? Math.round((filledCount / rules.length) * 100) : 0;

  const bonusSignals = [nonEmpty(input.portfolioLinks), nonEmpty(input.education), nonEmpty(input.certifications)];
  const bonus = Math.min(bonusSignals.filter(Boolean).length * 4, 10);

  const score = Math.min(base + bonus, 110);
  const suggestions =
    score < 80 ? missing.map((m) => `Add ${m.description.toLowerCase()} to complete your profile`) : [];

  return { profileType: input.profileType, score, bonus, missing, suggestions };
}
