import { registerAs } from '@nestjs/config';

/**
 * Feature flag configuration (#1420).
 *
 * Flags are plain booleans read from the environment so a rollout can be
 * enabled or disabled per deployment without a code change. The Joi schema in
 * `env.validation.ts` keeps `FEATURE_FLAG_*` to real booleans.
 */
const flag = (name: string): boolean => process.env[name] === 'true';

export const featureFlagsConfig = registerAs('featureFlags', () => ({
  newMatching: flag('FEATURE_FLAG_NEW_MATCHING'),
  aiRecommendations: flag('FEATURE_FLAG_AI_RECOMMENDATIONS'),
}));
