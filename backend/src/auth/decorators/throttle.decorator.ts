import { SetMetadata } from '@nestjs/common';

import { THROTTLE_OPTIONS } from '../constants/throttling.constants';

export const Throttle = (
  limit: number,
  ttl: number,
) =>
  SetMetadata(THROTTLE_OPTIONS, {
    limit,
    ttl,
  });