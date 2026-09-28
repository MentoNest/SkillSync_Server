import { registerAs } from '@nestjs/config';

/**
 * Feature flags configuration.
 * Enables gradual rollout of new capabilities per environment.
 */
export const featureFlagsConfig = registerAs('featureFlags', () => ({
  newMatching: process.env.FEATURE_FLAG_NEW_MATCHING === 'true',
  aiRecommendations: process.env.FEATURE_FLAG_AI_RECOMMENDATIONS === 'true',
}));
