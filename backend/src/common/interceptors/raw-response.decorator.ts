import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'skillsync:raw-response';

/**
 * Opt a route out of the global {@link TransformInterceptor} envelope.
 *
 * Needed for endpoints a browser or third-party SDK consumes directly (OAuth
 * callbacks, webhook deliveries, `text/csv` exports) where adding a wrapper
 * would break the contract.
 */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);