"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouterResponseController = void 0;
const common_1 = require("@nestjs/common");
const sse_signal_decorator_1 = require("@nestjs/common/decorators/http/sse-signal.decorator");
const shared_utils_1 = require("@nestjs/common/utils/shared.utils");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const sse_stream_1 = require("./sse-stream");
class RouterResponseController {
    constructor(applicationRef) {
        this.applicationRef = applicationRef;
        this.logger = new common_1.Logger(RouterResponseController.name);
    }
    async apply(result, response, httpStatusCode) {
        return this.applicationRef.reply(response, result, httpStatusCode);
    }
    async redirect(resultOrDeferred, response, redirectResponse) {
        const result = await this.transformToResult(resultOrDeferred);
        const statusCode = result && result.statusCode
            ? result.statusCode
            : redirectResponse.statusCode
                ? redirectResponse.statusCode
                : common_1.HttpStatus.FOUND;
        const url = result && result.url ? result.url : redirectResponse.url;
        this.applicationRef.redirect(response, statusCode, url);
    }
    async render(resultOrDeferred, response, template) {
        const result = await this.transformToResult(resultOrDeferred);
        return this.applicationRef.render(response, template, result);
    }
    async transformToResult(resultOrDeferred) {
        if ((0, rxjs_1.isObservable)(resultOrDeferred)) {
            return (0, rxjs_1.lastValueFrom)(resultOrDeferred);
        }
        return resultOrDeferred;
    }
    getStatusByMethod(requestMethod) {
        switch (requestMethod) {
            case common_1.RequestMethod.POST:
                return common_1.HttpStatus.CREATED;
            default:
                return common_1.HttpStatus.OK;
        }
    }
    setHeaders(response, headers) {
        headers.forEach(({ name, value }) => this.applicationRef.setHeader(response, name, typeof value === 'function' ? value() : value));
    }
    setStatus(response, statusCode) {
        this.applicationRef.status(response, statusCode);
    }
    async sse(result, response, request, options) {
        // It's possible that we sent headers already so don't use a stream
        if (response.writableEnded) {
            // The response is already gone: abort the request-scoped signal so
            // handler cleanup wired to @SseSignal() still runs, and swallow late
            // handler rejections that can no longer be delivered to the client.
            this.getOrCreateAbortController(request).abort();
            Promise.resolve(result).catch((err) => this.logger.error(err));
            return;
        }
        const stream = new sse_stream_1.SseStream(request);
        const statusCode = options?.statusCode ??
            response.statusCode ??
            200;
        // Create a per-request AbortController and expose its signal on the request
        // object so async @Sse() handlers can observe client disconnects (via the
        // @SseSignal() parameter decorator) and stop/clean up in-flight setup work.
        // The controller is reused if one was already attached upstream (e.g. when the
        // handler is wrapped by interceptors and the signal was created earlier).
        const abortController = this.getOrCreateAbortController(request);
        return new Promise((resolve, reject) => {
            let settled = false;
            let closeRequested = false;
            let subscription;
            const disconnectSource = request.socket ?? response;
            // Ends the request-scoped lifetime: stops listening for disconnects and
            // aborts the signal handed to the route handler. Every terminal path of
            // the SSE lifecycle (disconnect, completion, error) funnels through here,
            // so a handler that ties its resources to the signal releases them once,
            // regardless of how the stream ended. `abort()` is idempotent, so paths
            // that already aborted on disconnect are unaffected.
            const finalize = () => {
                disconnectSource.removeListener('close', onClose);
                abortController.abort();
            };
            const endStream = () => {
                if (!stream.writableEnded) {
                    stream.end();
                }
            };
            const onClose = () => {
                if (settled || closeRequested) {
                    return;
                }
                closeRequested = true;
                if (!subscription) {
                    finalize();
                    return;
                }
                settled = true;
                finalize();
                subscription?.unsubscribe();
                endStream();
                response.end();
                resolve();
            };
            disconnectSource.once('close', onClose);
            Promise.resolve(result)
                .then(observableResult => {
                if (settled) {
                    return;
                }
                this.assertObservable(observableResult);
                if (closeRequested) {
                    // The client disconnected while the async handler was resolving.
                    // Do not subscribe the producer Observable after the consumer has
                    // already gone away — subscribing only to abort it in the same tick
                    // would start producer side effects just to immediately cancel them.
                    settled = true;
                    endStream();
                    response.end();
                    resolve();
                    return;
                }
                stream.pipe(response, {
                    additionalHeaders: options?.additionalHeaders,
                    statusCode,
                });
                subscription = observableResult
                    .pipe((0, operators_1.map)((message) => {
                    if ((0, shared_utils_1.isObject)(message)) {
                        return message;
                    }
                    return { data: message };
                }), (0, operators_1.concatMap)(message => new Promise(resolve => stream.writeMessage(message, () => resolve()))), (0, operators_1.catchError)(err => {
                    if (!stream.headersCommitted) {
                        throw err;
                    }
                    const data = err instanceof Error ? err.message : err;
                    stream.writeMessage({ type: 'error', data }, writeError => {
                        if (writeError) {
                            this.logger.error(writeError);
                        }
                    });
                    return rxjs_1.EMPTY;
                }))
                    .subscribe({
                    error: err => {
                        if (settled) {
                            return;
                        }
                        settled = true;
                        finalize();
                        endStream();
                        reject(err);
                    },
                    complete: () => {
                        if (settled) {
                            return;
                        }
                        settled = true;
                        finalize();
                        endStream();
                        resolve();
                    },
                });
                // Commit SSE headers on the next macrotask. Pipe validation errors
                // propagate through microtasks (which complete before macrotasks),
                // so if the lifecycle errored, `settled` is already true and we
                // skip the write. Otherwise headers are sent immediately rather
                // than waiting for the first Observable emission.
                setTimeout(() => {
                    if (!settled) {
                        stream.commitHeaders();
                    }
                }, 0);
            })
                .catch(err => {
                if (settled) {
                    return;
                }
                if (closeRequested) {
                    settled = true;
                    endStream();
                    response.end();
                    resolve();
                    return;
                }
                settled = true;
                finalize();
                endStream();
                reject(err);
            });
        });
    }
    assertObservable(value) {
        if (!(0, rxjs_1.isObservable)(value)) {
            throw new ReferenceError('You must return an Observable stream to use Server-Sent Events (SSE).');
        }
    }
    getOrCreateAbortController(request) {
        const carrier = request;
        if (!carrier[sse_signal_decorator_1.SSE_ABORT_CONTROLLER]) {
            carrier[sse_signal_decorator_1.SSE_ABORT_CONTROLLER] = new AbortController();
        }
        return carrier[sse_signal_decorator_1.SSE_ABORT_CONTROLLER];
    }
}
exports.RouterResponseController = RouterResponseController;
