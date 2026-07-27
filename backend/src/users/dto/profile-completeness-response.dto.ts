export interface MissingField {
  field: string;
  description: string;
}

/**
 * #1004: Response shape for GET /user/profile/completeness.
 * `score` can exceed 100 (up to 110) when optional-field bonus applies.
 */
export class ProfileCompletenessResponseDto {
  score: number;
  profileType: 'mentor' | 'mentee';
  missingFields: MissingField[];
  suggestions: string[];
}

export interface UserCompletenessSummary extends ProfileCompletenessResponseDto {
  userId: string;
}
