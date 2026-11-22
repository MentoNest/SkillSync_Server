/**
 * Pure, dynamic profile completeness calculation. Nothing is persisted: every
 * request derives the score from the current entity state.
 */

export type CompletenessProfileType = 'mentor' | 'mentee';

export interface CompletenessProfile {
  bio?: string | null;
  skills?: string[] | null;
  hourlyRateUsdCents?: number | null;
  expertiseAreas?: string[] | null;
  learningGoals?: string | null;
  interests?: string[] | null;
  experienceLevel?: string | null;
}

export interface CompletenessUser {
  avatarUrl?: string | null;
  education?: unknown[] | null;
  certifications?: unknown[] | null;
}

export interface CompletenessInput {
  profileType: CompletenessProfileType;
  profile?: CompletenessProfile | null;
  user: CompletenessUser;
  availabilitySlotCount: number;
  portfolioLinkCount: number;
}

export interface MissingField {
  field: string;
  description: string;
}

export interface CompletenessResult {
  profileType: CompletenessProfileType;
  /** Final score including optional-field bonus; capped at 110. */
  score: number;
  /** Required-field-only percentage, 0–100. */
  baseScore: number;
  /** Extra percentage points from optional fields, 0–10. */
  bonusPoints: number;
  missingFields: MissingField[];
  /** Present only when baseScore < 80 (configurable). */
  suggestions: string[];
  calculatedAt: string;
}

interface RequiredField {
  field: string;
  description: string;
  filled: (input: CompletenessInput) => boolean;
}

const hasText = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;
const hasItems = (value: unknown[] | null | undefined): boolean =>
  Array.isArray(value) && value.length > 0;

const MENTOR_REQUIRED: RequiredField[] = [
  { field: 'bio', description: 'Add a professional bio.', filled: (i) => hasText(i.profile?.bio) },
  { field: 'skills', description: 'List at least one skill you teach.', filled: (i) => hasItems(i.profile?.skills) },
  {
    field: 'hourlyRateUsdCents',
    description: 'Set your hourly rate (or explicitly set it to free).',
    filled: (i) => i.profile?.hourlyRateUsdCents !== null && i.profile?.hourlyRateUsdCents !== undefined,
  },
  {
    field: 'expertiseAreas',
    description: 'Add your areas of expertise.',
    filled: (i) => hasItems(i.profile?.expertiseAreas),
  },
  {
    field: 'avatarUrl',
    description: 'Upload a profile avatar.',
    filled: (i) => hasText(i.user.avatarUrl),
  },
  {
    field: 'availabilitySlots',
    description: 'Add at least one availability slot.',
    filled: (i) => i.availabilitySlotCount > 0,
  },
];

const MENTEE_REQUIRED: RequiredField[] = [
  {
    field: 'learningGoals',
    description: 'Describe what you want to learn.',
    filled: (i) => hasText(i.profile?.learningGoals),
  },
  {
    field: 'skillLevel',
    description: 'Set your current skill level.',
    filled: (i) => hasText(i.profile?.experienceLevel),
  },
  {
    field: 'areasOfInterest',
    description: 'Choose at least one area of interest.',
    filled: (i) => hasItems(i.profile?.interests),
  },
];

/** Optional-field bonus weights; the total is capped at 10 percentage points. */
const BONUS_WEIGHTS = {
  portfolioLinks: 4,
  education: 3,
  certifications: 3,
} as const;

/**
 * Computes a 0–110 score: required fields make up the first 100 points and
 * optional portfolio/education/certification fields add up to 10 more.
 */
export function calculateProfileCompleteness(
  input: CompletenessInput,
  suggestionThreshold = 80,
): CompletenessResult {
  const required = input.profileType === 'mentor' ? MENTOR_REQUIRED : MENTEE_REQUIRED;
  const missingFields = required
    .filter((field) => !field.filled(input))
    .map(({ field, description }) => ({ field, description }));

  const filled = required.length - missingFields.length;
  const baseScore = required.length === 0 ? 0 : Math.round((filled / required.length) * 100);

  const bonusPoints = Math.min(
    10,
    (input.portfolioLinkCount > 0 ? BONUS_WEIGHTS.portfolioLinks : 0) +
      (hasItems(input.user.education) ? BONUS_WEIGHTS.education : 0) +
      (hasItems(input.user.certifications) ? BONUS_WEIGHTS.certifications : 0),
  );

  return {
    profileType: input.profileType,
    score: Math.min(110, baseScore + bonusPoints),
    baseScore,
    bonusPoints,
    missingFields,
    suggestions:
      baseScore < suggestionThreshold
        ? [
            ...missingFields.map((field) => field.description),
            'Complete your profile to unlock better mentor matches.',
          ]
        : [],
    calculatedAt: new Date().toISOString(),
  };
}
