import { SetMetadata } from '@nestjs/common';

export const FEATURE_FLAG_KEY = 'featureFlag';

export const FeatureFlag = (feature: string) => SetMetadata(FEATURE_FLAG_KEY, feature);
