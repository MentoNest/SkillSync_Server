import { FastifyCorsOptions } from '@fastify/cors';
import { Logger, RequestMethod, VersioningOptions } from '@nestjs/common';
import { VersionValue } from '@nestjs/common/interfaces';
import { AbstractHttpAdapter } from '@nestjs/core/adapters/http-adapter';
import { FastifyBaseLogger, FastifyBodyParser, FastifyInstance, FastifyPluginAsync, FastifyPluginCallback, FastifyRegister, FastifyReply, FastifyRequest, FastifyServerOptions, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerBase, RawServerDefault, RequestGenericInterface, RouteGenericInterface } from 'fastify';
import * as http from 'http';
import * as http2 from 'http2';
import * as https from 'https';
import { InjectOptions, Chain as LightMyRequestChain, Response as LightMyRequestResponse } from 'light-my-request';
import { NestFastifyBodyParserOptions } from '../interfaces';
import { FastifyStaticOptions, FastifyViewOptions } from '../interfaces/external';
type FastifyAdapterBaseOptions<Server extends RawServerBase = RawServerDefault, Logger extends FastifyBaseLogger = FastifyBaseLogger> = FastifyServerOptions<Server, Logger> & {
    skipMiddie?: boolean;
};
type FastifyHttp2SecureOptions<Server extends http2.Http2SecureServer, Logger extends FastifyBaseLogger = FastifyBaseLogger> = FastifyAdapterBaseOptions<Server, Logger> & {
    http2: true;
    https: http2.SecureServerOptions;
};
type FastifyHttp2Options<Server extends http2.Http2Server, Logger extends FastifyBaseLogger = FastifyBaseLogger> = FastifyAdapterBaseOptions<Server, Logger> & {
    http2: true;
    http2SessionTimeout?: number;
};
type FastifyHttpsOptions<Server extends https.Server, Logger extends FastifyBaseLogger = FastifyBaseLogger> = FastifyAdapterBaseOptions<Server, Logger> & {
    https: https.ServerOptions;
};
type FastifyHttpOptions<Server extends http.Server, Logger extends FastifyBaseLogger = FastifyBaseLogger> = FastifyAdapterBaseOptions<Server, Logger> & {
    http: http.ServerOptions;
};
type VersionedRoute<TRequest, TResponse> = ((req: TRequest, res: TResponse, next: Function) => Function) & {
    version: VersionValue;
    versioningOptions: VersioningOptions;
};
/**
 * The following type assertion is valid as we enforce "middie" plugin registration
 * which enhances the FastifyRequest.RawRequest with the "originalUrl" property.
 * ref https://github.com/fastify/middie/pull/16
 * ref https://github.com/fastify/fastify/pull/559
 */
type FastifyRawRequest<TServer extends RawServerBase> = RawRequestDefaultExpression<TServer> & {
    originalUrl?: string;
};
/**
 * @publicApi
 */
export declare class FastifyAdapter<TServer extends RawServerBase = RawServerDefault, TRawRequest extends FastifyRawRequest<TServer> = FastifyRawRequest<TServer>, TRawResponse extends RawReplyDefaultExpression<TServer> = RawReplyDefaultExpression<TServer>, TRequest extends FastifyRequest<RequestGenericInterface, TServer, TRawRequest> = FastifyRequest<RequestGenericInterface, TServer, TRawRequest>, TReply extends FastifyReply<RouteGenericInterface, TServer, TRawRequest, TRawResponse> = FastifyReply<RouteGenericInterface, TServer, TRawRequest, TRawResponse>, TInstance extends FastifyInstance<TServer, TRawRequest, TRawResponse> = FastifyInstance<TServer, TRawRequest, TRawResponse>> extends AbstractHttpAdapter<TServer, TRequest, TReply> {
    protected readonly logger: Logger;
    protected readonly instance: TInstance;
    protected _pathPrefix?: string;
    private _isParserRegistered;
    private onRequestHook?;
    private onResponseHook?;
    private isMiddieRegistered;
    private pendingMiddlewares;
    private versioningOptions?;
    private readonly versionConstraint;
    get isParserRegistered(): boolean;
    constructor(instanceOrOptions?: TInstance | FastifyHttp2Options<any> | FastifyHttp2SecureOptions<any> | FastifyHttpsOptions<any> | FastifyHttpOptions<any> | FastifyAdapterBaseOptions<TServer>);
    setOnRequestHook(hook: (request: TRequest, reply: TReply, done: (err?: Error) => void) => void | Promise<void>): void;
    setOnResponseHook(hook: (request: TRequest, reply: TReply, done: (err?: Error) => void) => void | Promise<void>): void;
    init(): Promise<void>;
    listen(port: string | number, callback?: () => void): void;
    listen(port: string | number, hostname: string, callback?: () => void): void;
    get(...args: any[]): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    post(...args: any[]): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    head(...args: any[]): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    delete(...args: any[]): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    put(...args: any[]): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    patch(...args: any[]): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    options(...args: any[]): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    search(...args: any[]): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    propfind(...args: any[]): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    proppatch(...args: any[]): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    mkcol(...args: any[]): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    copy(...args: any[]): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    move(...args: any[]): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    lock(...args: any[]): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    unlock(...args: any[]): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    applyVersionFilter(handler: Function, version: VersionValue, versioningOptions: VersioningOptions): VersionedRoute<TRequest, TReply>;
    reply(response: TRawResponse | TReply, body: any, statusCode?: number): FastifyReply<RouteGenericInterface, TServer, TRawRequest, TRawResponse, unknown, import("fastify").FastifySchema, import("fastify").FastifyTypeProviderDefault, unknown>;
    status(response: TRawResponse | TReply, statusCode: number): any;
    end(response: TReply, message?: string): void;
    render(response: TReply & {
        view: Function;
    }, view: string, options: any): any;
    redirect(response: TReply, statusCode: number, url: string): FastifyReply<RouteGenericInterface, TServer, TRawRequest, TRawResponse, unknown, import("fastify").FastifySchema, import("fastify").FastifyTypeProviderDefault, unknown>;
    setErrorHandler(handler: Parameters<TInstance['setErrorHandler']>[0]): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProvider>;
    setNotFoundHandler(handler: Function): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    getHttpServer<T = TServer>(): T;
    getInstance<T = TInstance>(): T;
    register<TRegister extends Parameters<FastifyRegister<FastifyInstance<TServer, TRawRequest, TRawResponse>>>>(plugin: TRegister['0'], opts?: TRegister['1']): any;
    inject(): LightMyRequestChain;
    inject(opts: InjectOptions | string): Promise<LightMyRequestResponse>;
    close(): Promise<undefined>;
    initHttpServer(): void;
    useStaticAssets(options: FastifyStaticOptions): any;
    setViewEngine(options: FastifyViewOptions | string): any;
    isHeadersSent(response: TReply): boolean;
    getHeader(response: any, name: string): any;
    setHeader(response: TReply, name: string, value: string): FastifyReply<RouteGenericInterface, TServer, TRawRequest, TRawResponse, unknown, import("fastify").FastifySchema, import("fastify").FastifyTypeProviderDefault, unknown>;
    appendHeader(response: any, name: string, value: string): void;
    getRequestHostname(request: TRequest): string;
    getRequestMethod(request: TRequest): string;
    getRequestUrl(request: TRequest): string;
    getRequestUrl(request: TRawRequest): string;
    enableCors(options?: FastifyCorsOptions): void;
    registerParserMiddleware(prefix?: string, rawBody?: boolean): void;
    useBodyParser(type: string | string[] | RegExp, rawBody: boolean, options?: NestFastifyBodyParserOptions, parser?: FastifyBodyParser<Buffer, TServer>): void;
    createMiddlewareFactory(requestMethod: RequestMethod): Promise<(path: string, callback: Function) => any>;
    getType(): string;
    use(...args: any[]): any;
    protected registerWithPrefix(factory: FastifyPluginCallback<any> | FastifyPluginAsync<any> | Promise<{
        default: FastifyPluginCallback<any>;
    }> | Promise<{
        default: FastifyPluginAsync<any>;
    }>, prefix?: string): FastifyInstance<TServer, TRawRequest, TRawResponse, FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault> & PromiseLike<undefined> & {
        __linterBrands: "SafePromiseLike";
    };
    private isNativeResponse;
    private registerJsonContentParser;
    private registerUrlencodedContentParser;
    private registerMiddie;
    private getRequestOriginalUrl;
    private injectRouteOptions;
    private sanitizeUrl;
    private removeDuplicateSlashes;
    private trimLastSlash;
}
export {};
