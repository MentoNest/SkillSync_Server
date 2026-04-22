import { RouteShorthandOptions } from 'fastify';
/**
 * @publicApi
 *
 * @param config See {@link https://fastify.dev/docs/latest/Reference/Routes/#constraints}
 */
export declare const RouteConstraints: (config: RouteShorthandOptions["constraints"]) => import("@nestjs/common").CustomDecorator<string>;
