"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fastifyMiddie = fastifyMiddie;
const fastify_plugin_1 = require("fastify-plugin");
const url_sanitizer_1 = require("find-my-way/lib/url-sanitizer");
const path_to_regexp_1 = require("path-to-regexp");
const reusify = require("reusify");
function bindLast(fn, last) {
    return (...args) => fn(...args, last);
}
/**
 * A clone of `@fastify/middie` engine https://github.com/fastify/middie
 * with an extra vulnerability fix. Path is now decoded before matching to
 * avoid bypassing middleware with encoded characters.
 */
function middie(complete, initialConfig) {
    const middlewares = [];
    const pool = reusify(Holder);
    return {
        use,
        run: bindLast(run, initialConfig),
    };
    function use(url, f) {
        if (f === undefined) {
            f = url;
            url = null;
        }
        let regexp;
        if (typeof url === 'string') {
            const pathRegExp = (0, path_to_regexp_1.pathToRegexp)(sanitizePrefixUrl(url), {
                end: false,
            });
            regexp = pathRegExp.regexp;
        }
        if (Array.isArray(f)) {
            for (const val of f) {
                middlewares.push({ regexp, fn: val });
            }
        }
        else {
            middlewares.push({ regexp, fn: f });
        }
        return this;
    }
    function run(req, res, ctx, initialConfig) {
        if (!middlewares.length) {
            complete(null, req, res, ctx);
            return;
        }
        req.originalUrl = req.url;
        const holder = pool.get();
        holder.req = req;
        holder.res = res;
        holder.url = sanitizeUrl(req.url);
        holder.context = ctx;
        holder.initialConfig = initialConfig;
        holder.done();
    }
    function Holder() {
        this.req = null;
        this.res = null;
        this.url = null;
        this.context = null;
        this.initialConfig = null;
        this.i = 0;
        const that = this;
        this.done = function (err) {
            const req = that.req;
            const res = that.res;
            const url = that.url;
            const context = that.context;
            const i = that.i++;
            req.url = req.originalUrl;
            if (res.finished === true || res.writableEnded === true) {
                cleanup();
                return;
            }
            if (err || middlewares.length === i) {
                complete(err, req, res, context);
                cleanup();
            }
            else {
                const { fn, regexp } = middlewares[i];
                if (regexp) {
                    // Decode URL before matching to avoid bypassing middleware
                    let sanitizedUrl = url;
                    if (that.initialConfig.ignoreDuplicateSlashes ||
                        that.initialConfig.routerOptions?.ignoreDuplicateSlashes) {
                        sanitizedUrl = removeDuplicateSlashes(sanitizedUrl);
                    }
                    if (that.initialConfig.ignoreTrailingSlash ||
                        that.initialConfig.routerOptions?.ignoreTrailingSlash) {
                        sanitizedUrl = trimLastSlash(sanitizedUrl);
                    }
                    if (that.initialConfig.caseSensitive === false ||
                        that.initialConfig.routerOptions?.caseSensitive === false) {
                        sanitizedUrl = sanitizedUrl.toLowerCase();
                    }
                    const decodedUrl = (0, url_sanitizer_1.safeDecodeURI)(sanitizedUrl, that.initialConfig?.routerOptions?.useSemicolonDelimiter ||
                        that.initialConfig?.useSemicolonDelimiter).path;
                    const result = regexp.exec(decodedUrl);
                    if (result) {
                        req.url = req.url.replace(result[0], '');
                        if (req.url[0] !== '/')
                            req.url = '/' + req.url;
                        fn(req, res, that.done);
                    }
                    else {
                        that.done();
                    }
                }
                else {
                    fn(req, res, that.done);
                }
            }
        };
        function cleanup() {
            that.req = null;
            that.res = null;
            that.context = null;
            that.initialConfig = null;
            that.i = 0;
            pool.release(that);
        }
    }
}
function removeDuplicateSlashes(path) {
    const REMOVE_DUPLICATE_SLASHES_REGEXP = /\/\/+/g;
    return path.indexOf('//') !== -1
        ? path.replace(REMOVE_DUPLICATE_SLASHES_REGEXP, '/')
        : path;
}
function trimLastSlash(path) {
    if (path.length > 1 && path.charCodeAt(path.length - 1) === 47) {
        return path.slice(0, -1);
    }
    return path;
}
function sanitizeUrl(url) {
    for (let i = 0, len = url.length; i < len; i++) {
        const charCode = url.charCodeAt(i);
        if (charCode === 63 || charCode === 35) {
            return url.slice(0, i);
        }
    }
    return url;
}
function sanitizePrefixUrl(url) {
    if (url === '/')
        return '';
    if (url[url.length - 1] === '/')
        return url.slice(0, -1);
    return url;
}
const kMiddlewares = Symbol('fastify-middie-middlewares');
const kMiddie = Symbol('fastify-middie-instance');
const kMiddieHasMiddlewares = Symbol('fastify-middie-has-middlewares');
const supportedHooksWithPayload = [
    'onError',
    'onSend',
    'preParsing',
    'preSerialization',
];
const supportedHooksWithoutPayload = [
    'onRequest',
    'onResponse',
    'onTimeout',
    'preHandler',
    'preValidation',
];
const supportedHooks = [
    ...supportedHooksWithPayload,
    ...supportedHooksWithoutPayload,
];
function fastifyMiddie(fastify, options, next) {
    fastify.decorate('use', use);
    fastify[kMiddlewares] = [];
    fastify[kMiddieHasMiddlewares] = false;
    fastify[kMiddie] = middie(onMiddieEnd, fastify.initialConfig);
    const hook = options.hook || 'onRequest';
    if (!supportedHooks.includes(hook)) {
        next(new Error(`The hook "${hook}" is not supported by fastify-middie`));
        return;
    }
    fastify
        .addHook(hook, supportedHooksWithPayload.includes(hook)
        ? runMiddieWithPayload
        : runMiddie)
        .addHook('onRegister', onRegister);
    function use(path, fn) {
        if (typeof path === 'string') {
            const prefix = this.prefix;
            path = prefix + (path === '/' && prefix.length > 0 ? '' : path);
        }
        this[kMiddlewares].push([path, fn]);
        if (fn == null) {
            this[kMiddie].use(path);
        }
        else {
            this[kMiddie].use(path, fn);
        }
        this[kMiddieHasMiddlewares] = true;
        return this;
    }
    function runMiddie(req, reply, next) {
        if (this[kMiddieHasMiddlewares]) {
            const raw = req.raw;
            raw.id = req.id;
            raw.hostname = req.hostname;
            raw.protocol = req.protocol;
            raw.ip = req.ip;
            raw.ips = req.ips;
            raw.log = req.log;
            req.raw.query = req.query;
            reply.raw.log = req.log;
            if (req.body !== undefined)
                req.raw.body = req.body;
            this[kMiddie].run(req.raw, reply.raw, next);
        }
        else {
            next();
        }
    }
    function runMiddieWithPayload(req, reply, _payload, next) {
        runMiddie.bind(this)(req, reply, next);
    }
    function onMiddieEnd(err, _req, _res, next) {
        next(err);
    }
    function onRegister(instance) {
        const middlewares = instance[kMiddlewares].slice();
        instance[kMiddlewares] = [];
        instance[kMiddie] = middie(onMiddieEnd, instance.initialConfig);
        instance[kMiddieHasMiddlewares] = false;
        instance.decorate('use', use);
        for (const middleware of middlewares) {
            instance.use(...middleware);
        }
    }
    next();
}
/**
 * A clone of `@fastify/middie` engine https://github.com/fastify/middie
 * with an extra vulnerability fix. Path is now decoded before matching to
 * avoid bypassing middleware with encoded characters.
 */
exports.default = (0, fastify_plugin_1.default)(fastifyMiddie, {
    fastify: '5.x',
    name: '@fastify/middie',
});
