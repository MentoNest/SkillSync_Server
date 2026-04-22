import { FastifyInstance, FastifyPluginCallback } from 'fastify';
import * as http from 'node:http';
export type MiddlewareFn<Req extends {
    url: string;
    originalUrl?: string;
}, Res extends {
    finished?: boolean;
    writableEnded?: boolean;
}, Ctx = unknown> = (req: Req, res: Res, next: (err?: unknown) => void) => void;
declare const supportedHooks: readonly ["onError", "onSend", "preParsing", "preSerialization", "onRequest", "onResponse", "onTimeout", "preHandler", "preValidation"];
type SupportedHook = (typeof supportedHooks)[number];
interface MiddieOptions {
    hook?: SupportedHook;
}
declare function fastifyMiddie(fastify: FastifyInstance, options: MiddieOptions, next: (err?: Error) => void): void;
declare namespace fastifyMiddie {
    export interface FastifyMiddieOptions {
        hook?: 'onRequest' | 'preParsing' | 'preValidation' | 'preHandler' | 'preSerialization' | 'onSend' | 'onResponse' | 'onTimeout' | 'onError';
    }
    type FastifyMiddie = FastifyPluginCallback<fastifyMiddie.FastifyMiddieOptions>;
    export interface IncomingMessageExtended {
        body?: any;
        query?: any;
    }
    export type NextFunction = (err?: any) => void;
    export type SimpleHandleFunction = (req: http.IncomingMessage & IncomingMessageExtended, res: http.ServerResponse) => void;
    export type NextHandleFunction = (req: http.IncomingMessage & IncomingMessageExtended, res: http.ServerResponse, next: NextFunction) => void;
    export type Handler = SimpleHandleFunction | NextHandleFunction;
    export const fastifyMiddie: FastifyMiddie;
    export { fastifyMiddie as default };
}
declare module 'fastify' {
    interface FastifyInstance {
        use(fn: fastifyMiddie.Handler): this;
        use(route: string, fn: fastifyMiddie.Handler): this;
        use(routes: string[], fn: fastifyMiddie.Handler): this;
    }
}
/**
 * A clone of `@fastify/middie` engine https://github.com/fastify/middie
 * with an extra vulnerability fix. Path is now decoded before matching to
 * avoid bypassing middleware with encoded characters.
 */
declare const _default: typeof fastifyMiddie;
export default _default;
export { fastifyMiddie };
