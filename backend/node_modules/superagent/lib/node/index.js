"use strict";

/**
 * Module dependencies.
 */

const {
  format
} = require('node:url');
const Stream = require('node:stream');
const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const zlib = require('node:zlib');
const util = require('node:util');
const qs = require('qs');
const mime = require('mime');
let methods = require('methods');
const FormData = require('form-data');
const formidable = require('formidable');
const debug = require('debug')('superagent');
const CookieJar = require('cookiejar');
const safeStringify = require('fast-safe-stringify');
const utils = require('../utils');
const RequestBase = require('../request-base');
const http2 = require('./http2wrapper');
const {
  decompress
} = require('./unzip');
const Response = require('./response');
const {
  mixin,
  hasOwn,
  isBrotliEncoding,
  isGzipOrDeflateEncoding
} = utils;
const {
  chooseDecompresser
} = require('./decompress');
function request(method, url) {
  // callback
  if (typeof url === 'function') {
    return new exports.Request('GET', method).end(url);
  }

  // url first
  if (arguments.length === 1) {
    return new exports.Request('GET', method);
  }
  return new exports.Request(method, url);
}
module.exports = request;
exports = module.exports;

/**
 * Expose `Request`.
 */

exports.Request = Request;

/**
 * Expose the agent function
 */

exports.agent = require('./agent');

/**
 * Noop.
 */

function noop() {}

/**
 * Close an underlying Node request/session created during setup.
 *
 * Used when header application or later request-path work throws after
 * `http.request()` / `http2.connect()` has already allocated a socket.
 *
 * @param {Request} request_
 * @api private
 */
function disposeNodeRequest(request_) {
  const {
    req
  } = request_;
  if (!req || request_._requestDisposed) {
    return;
  }
  request_._requestDisposed = true;
  if (request_._streamResponseListener) {
    req.removeListener('response', request_._streamResponseListener);
    request_._streamResponseListener = undefined;
    request_._streamResponse = undefined;
  }
  try {
    // HTTP/2 wrapper keeps a session open as soon as request() is called.
    // Prefer destroying that session so we never call abort() → getFrame()
    // with invalid headers (which would emit a late protocol error).
    if (req.session && typeof req.session.destroy === 'function') {
      req.session.destroy();
    }
    if (req.socket && typeof req.socket.destroy === 'function') {
      req.socket.destroy();
    }
    if (typeof req.destroy === 'function') {
      req.destroy();
      return;
    }
    if (typeof req.abort === 'function') {
      req.abort();
      return;
    }
    if (typeof req.end === 'function') {
      req.end();
    }
  } catch (err) {
    debug('error disposing request after setup failure', err);
  }
}

/**
 * Preserve dot-only path segments that WHATWG URL normalizes away.
 *
 * @param {String} urlString
 * @returns {{urlString: String, restorePath: Function}}
 * @api private
 */
function preserveDotSegments(urlString) {
  const parts = urlString.match(/^([a-z][a-z\d+.-]*:\/\/[^/?#]*)([^?#]*)(.*)$/i);
  if (!parts) {
    return {
      urlString,
      restorePath(path) {
        return path;
      }
    };
  }
  const segments = [];
  const prefix = '__superagent_dot_segment_';
  const path = parts[2].replace(/\/((?:\.|%2e){1,2})(?=\/|$)/gi, (_, segment) => {
    const marker = `${prefix}${segments.length}__`;
    segments.push(segment);
    return `/${marker}`;
  });
  return {
    urlString: `${parts[1]}${path}${parts[3]}`,
    restorePath(requestPath) {
      let restoredPath = requestPath;
      for (const [index, segment] of segments.entries()) {
        restoredPath = restoredPath.replace(`${prefix}${index}__`, segment);
      }
      return restoredPath;
    }
  };
}

/**
 * Default a scheme-less URL string to http://.
 *
 * @param {String} urlString
 * @return {String}
 * @api private
 */
function withDefaultProtocol(urlString) {
  return urlString.indexOf('http') === 0 ? urlString : `http://${urlString}`;
}

/**
 * Protocols a redirect may lead to. A request made over a Unix domain socket
 * may additionally be redirected within that same socket (see
 * `isAllowedRedirectTarget`).
 */
const REDIRECT_PROTOCOLS = new Set(['http:', 'https:']);
const UNIX_SOCKET_PROTOCOLS = new Set(['http+unix:', 'https+unix:']);

/**
 * Whether a redirect from `current` to `target` may be followed.
 *
 * Only http(s) targets are followed. A remote server must never be able to
 * steer the client into a local Unix domain socket (`http+unix://`) or any
 * other scheme through a Location header; a request that was itself made over
 * a Unix domain socket may only be redirected within that same socket.
 *
 * @param {URL} current
 * @param {URL} target
 * @return {Boolean}
 * @api private
 */
function isAllowedRedirectTarget(current, target) {
  if (REDIRECT_PROTOCOLS.has(target.protocol)) return true;
  return UNIX_SOCKET_PROTOCOLS.has(target.protocol) && target.protocol === current.protocol && target.hostname !== '' && target.hostname === current.hostname;
}

/**
 * Whether two URLs share an origin. Unix socket URLs have an opaque (`null`)
 * WHATWG origin, so they are compared by protocol and socket path instead.
 *
 * @param {URL} current
 * @param {URL} target
 * @return {Boolean}
 * @api private
 */
function isSameOrigin(current, target) {
  if (current.origin !== 'null' && target.origin !== 'null') {
    return current.origin === target.origin;
  }
  return current.protocol === target.protocol && current.hostname === target.hostname && current.port === target.port;
}

/**
 * Expose `Response`.
 */

exports.Response = Response;

/**
 * Define "form" mime type.
 */

mime.define({
  'application/x-www-form-urlencoded': ['form', 'urlencoded', 'form-data']
}, true);

/**
 * Protocol map.
 */

exports.protocols = {
  'http:': http,
  'https:': https,
  'http2:': http2
};

/**
 * Default serialization map.
 *
 *     superagent.serialize['application/xml'] = function(obj){
 *       return 'generated xml here';
 *     };
 *
 */

exports.serialize = {
  'application/x-www-form-urlencoded'(object) {
    return qs.stringify(object, {
      indices: false,
      strictNullHandling: true
    });
  },
  'application/json': safeStringify,
  // CSP reports carry JSON bodies but use a distinct registered media type.
  'application/csp-report': safeStringify
};

/**
 * Default parsers.
 *
 *     superagent.parse['application/xml'] = function(res, fn){
 *       fn(null, res);
 *     };
 *
 */

exports.parse = require('./parsers');

/**
 * The default parsers as shipped; they only accumulate a buffered body, so
 * they are skipped for unbuffered responses (see `_end`). Captured here so
 * that a parser a user installs under the same key is still honoured.
 */
const BUILT_IN_PARSERS = {
  'application/x-www-form-urlencoded': exports.parse['application/x-www-form-urlencoded'],
  'application/json': exports.parse['application/json'],
  text: exports.parse.text,
  image: exports.parse.image
};
const BUFFERING_PARSERS = new Set(Object.keys(BUILT_IN_PARSERS).map(key => BUILT_IN_PARSERS[key]));

/**
 * Default buffering map. Can be used to set certain
 * response types to buffer/not buffer.
 *
 *     superagent.buffer['application/xml'] = true;
 */
exports.buffer = {};

/**
 * Initialize internal header tracking properties on a request instance.
 *
 * @param {Object} req the instance
 * @api private
 */
function _initHeaders(request_) {
  request_._header = {
    // coerces header names to lowercase
  };
  request_.header = {
    // preserves header name case
  };
}

/**
 * Initialize a new `Request` with the given `method` and `url`.
 *
 * @param {String} method
 * @param {String|Object} url
 * @api public
 */

function Request(method, url) {
  Stream.call(this);
  if (typeof url !== 'string') url = format(url);
  this._enableHttp2 = Boolean(process.env.HTTP2_TEST); // internal only
  this._agent = false;
  this._formData = null;
  this.method = method;
  this.url = url;
  _initHeaders(this);
  this.writable = true;
  this._redirects = 0;
  this.redirects(method === 'HEAD' ? 0 : 5);
  this.cookies = '';
  this.qs = {};
  this._query = [];
  this.qsRaw = this._query; // Unused, for backwards compatibility only
  this._redirectList = [];
  this._streamRequest = false;
  this._lookup = undefined;
  this.once('end', this.clearTimeout.bind(this));
}

/**
 * Inherit from `Stream` (which inherits from `EventEmitter`).
 * Mixin `RequestBase`.
 */
util.inherits(Request, Stream);
mixin(Request.prototype, RequestBase.prototype);

/**
 * Enable or Disable http2.
 *
 * Enable http2.
 *
 * ``` js
 * request.get('http://localhost/')
 *   .http2()
 *   .end(callback);
 *
 * request.get('http://localhost/')
 *   .http2(true)
 *   .end(callback);
 * ```
 *
 * Disable http2.
 *
 * ``` js
 * request = request.http2();
 * request.get('http://localhost/')
 *   .http2(false)
 *   .end(callback);
 * ```
 *
 * @param {Boolean} enable
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.http2 = function (bool) {
  if (exports.protocols['http2:'] === undefined) {
    throw new Error('superagent: this version of Node.js does not support http2');
  }
  this._enableHttp2 = bool === undefined ? true : bool;
  return this;
};

/**
 * Queue the given `file` as an attachment to the specified `field`,
 * with optional `options` (or filename).
 *
 * ``` js
 * request.post('http://localhost/upload')
 *   .attach('field', Buffer.from('<b>Hello world</b>'), 'hello.html')
 *   .end(callback);
 * ```
 *
 * A filename may also be used:
 *
 * ``` js
 * request.post('http://localhost/upload')
 *   .attach('files', 'image.jpg')
 *   .end(callback);
 * ```
 *
 * @param {String} field
 * @param {String|fs.ReadStream|Buffer} file
 * @param {String|Object} options
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.attach = function (field, file, options) {
  if (file) {
    if (this._data) {
      throw new Error("superagent can't mix .send() and .attach()");
    }
    let o = options || {};
    if (typeof options === 'string') {
      o = {
        filename: options
      };
    }
    if (typeof file === 'string') {
      if (!o.filename) o.filename = file;
      debug('creating `fs.ReadStream` instance for file: %s', file);
      file = fs.createReadStream(file);
      file.on('error', error => {
        const formData = this._getFormData();
        formData.emit('error', error);
      });
    } else if (!o.filename && file.path) {
      o.filename = file.path;
    }
    this._getFormData().append(field, file, o);
  }
  return this;
};
Request.prototype._getFormData = function () {
  if (!this._formData) {
    this._formData = new FormData();
    this._formData.on('error', error => {
      debug('FormData error', error);
      if (this.called) {
        // The request has already finished and the callback was called.
        // Silently ignore the error.
        return;
      }
      this.callback(error);
      this.abort();
    });
  }
  return this._formData;
};

/**
 * Gets/sets the `Agent` to use for this HTTP request. The default (if this
 * function is not called) is to opt out of connection pooling (`agent: false`).
 *
 * @param {http.Agent} agent
 * @return {http.Agent}
 * @api public
 */

Request.prototype.agent = function (agent) {
  if (arguments.length > 0 && agent && typeof agent === 'object' && typeof agent.addRequest !== 'function') {
    throw new TypeError('.agent() expects an http(s).Agent-compatible object. Did you mean to use .cert() and .key()?');
  }
  if (arguments.length === 0) return this._agent;
  this._agent = agent;
  return this;
};

/**
 * Gets/sets the `lookup` function to use custom DNS resolver.
 *
 * @param {Function} lookup
 * @return {Function}
 * @api public
 */

Request.prototype.lookup = function (lookup) {
  if (arguments.length === 0) return this._lookup;
  this._lookup = lookup;
  return this;
};

/**
 * Set _Content-Type_ response header passed through `mime.getType()`.
 *
 * Examples:
 *
 *      request.post('/')
 *        .type('xml')
 *        .send(xmlstring)
 *        .end(callback);
 *
 *      request.post('/')
 *        .type('json')
 *        .send(jsonstring)
 *        .end(callback);
 *
 *      request.post('/')
 *        .type('application/json')
 *        .send(jsonstring)
 *        .end(callback);
 *
 * @param {String} type
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.type = function (type) {
  return this.set('Content-Type', type.includes('/') ? type : mime.getType(type));
};

/**
 * Set _Accept_ response header passed through `mime.getType()`.
 *
 * Examples:
 *
 *      superagent.types.json = 'application/json';
 *
 *      request.get('/agent')
 *        .accept('json')
 *        .end(callback);
 *
 *      request.get('/agent')
 *        .accept('application/json')
 *        .end(callback);
 *
 * @param {String} accept
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.accept = function (type) {
  return this.set('Accept', type.includes('/') ? type : mime.getType(type));
};

/**
 * Add query-string `val`.
 *
 * Examples:
 *
 *   request.get('/shoes')
 *     .query('size=10')
 *     .query({ color: 'blue' })
 *
 * @param {Object|String} val
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.query = function (value) {
  if (typeof value === 'string') {
    this._query.push(value);
  } else {
    Object.assign(this.qs, value);
  }
  return this;
};

/**
 * Write raw `data` / `encoding` to the socket.
 *
 * @param {Buffer|String} data
 * @param {String} encoding
 * @return {Boolean}
 * @api public
 */

Request.prototype.write = function (data, encoding) {
  const request_ = this.request();
  if (!this._streamRequest) {
    this._streamRequest = true;
    this._streamResponseListener = res => {
      this._streamResponse = res;
    };
    request_.once('response', this._streamResponseListener);
  }
  return request_.write(data, encoding);
};

/**
 * Pipe the request body to `stream`.
 *
 * @param {Stream} stream
 * @param {Object} options
 * @return {Stream}
 * @api public
 */

Request.prototype.pipe = function (stream, options) {
  this.piped = true; // HACK...
  this.buffer(false);
  this.end();
  return this._pipeContinue(stream, options);
};
Request.prototype._pipeContinue = function (stream, options) {
  this.req.once('response', res => {
    // redirect
    if (isRedirect(res.statusCode) && this._redirects++ !== this._maxRedirects) {
      return this._redirect(res) === this ? this._pipeContinue(stream, options) : undefined;
    }
    this.res = res;
    this._emitResponse();
    if (this._aborted) return;
    if (this._shouldDecompress(res)) {
      const decompresser = chooseDecompresser(res);
      decompresser.on('error', error => {
        if (error && error.code === 'Z_BUF_ERROR') {
          // unexpected end of file is ignored by browsers and curl
          stream.emit('end');
          return;
        }
        stream.emit('error', error);
      });
      res.pipe(decompresser).pipe(stream, options);
      // don't emit 'end' until decompresser has completed writing all its data.
      decompresser.once('end', () => this.emit('end'));
    } else {
      res.pipe(stream, options);
      res.once('end', () => this.emit('end'));
    }
  });
  return stream;
};

/**
 * Enable / disable buffering.
 *
 * @return {Boolean} [val]
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.buffer = function (value) {
  this._buffer = value !== false;
  return this;
};

/**
 * Redirect to `url
 *
 * @param {IncomingMessage} res
 * @return {Request} for chaining
 * @api private
 */

Request.prototype._redirect = function (res) {
  let url = res.headers.location;
  if (!url) {
    return this.callback(new Error('No location header for redirect'), res);
  }
  debug('redirect %s -> %s', this.url, url);

  // ensure the response is being consumed
  // this is required for Node v0.10+
  res.resume();

  // location
  //
  // The Location header is attacker controlled: a malformed value must not
  // throw out of the response event (which would crash the process), and only
  // http(s) targets may be followed. A remote server must never be able to
  // steer the client into a local Unix domain socket or another scheme.
  let target;
  let current;
  try {
    current = new URL(withDefaultProtocol(this.url));
    target = new URL(url, current);
  } catch (err) {
    const error = new Error(`Invalid redirect location: ${url}`);
    error.code = 'EINVALIDREDIRECT';
    error.status = res.statusCode;
    error.location = url;
    return this.callback(error, res);
  }
  if (!isAllowedRedirectTarget(current, target)) {
    const error = new Error(`Unsupported protocol in redirect location: ${target.href}`);
    error.code = 'EUNSUPPORTEDREDIRECT';
    error.status = res.statusCode;
    error.location = url;
    return this.callback(error, res);
  }
  url = target.href;
  this._emitPreRedirect(res);
  let headers = this.req.getHeaders ? this.req.getHeaders() : this.req._headers;
  const changesOrigin = !isSameOrigin(current, target);

  // implementation of 302 following defacto standard
  if (res.statusCode === 301 || res.statusCode === 302) {
    // strip Content-* related fields
    // in case of POST etc
    headers = utils.cleanHeader(headers, changesOrigin);

    // force GET
    this.method = this.method === 'HEAD' ? 'HEAD' : 'GET';

    // clear data
    this._data = null;
  }

  // 303 is always GET
  if (res.statusCode === 303) {
    // strip Content-* related fields
    // in case of POST etc
    headers = utils.cleanHeader(headers, changesOrigin);

    // force method
    this.method = 'GET';

    // clear data
    this._data = null;
  }

  // 307 preserves method
  // 308 preserves method
  if ((res.statusCode === 307 || res.statusCode === 308) && changesOrigin) {
    delete headers.authorization;
    delete headers.cookie;
  }

  // credentials given with `.auth(user, pass, { type: 'auto' })` are turned
  // into an Authorization header by every `request()` call, so they must be
  // dropped as well or they would be re-sent to the new origin
  if (changesOrigin) {
    this.username = undefined;
    this.password = undefined;
  }
  delete headers.host;
  delete this.req;
  delete this._formData;

  // remove all add header except User-Agent
  _initHeaders(this);

  // redirect
  this.res = res;
  this._endCalled = false;
  this.url = url;
  this.qs = {};
  this._query.length = 0;
  this.set(headers);
  this._emitRedirect();
  this._redirectList.push(this.url);
  this.end(this._callback);
  return this;
};

/**
 * Set Authorization field value with `user` and `pass`.
 *
 * Examples:
 *
 *   .auth('tobi', 'learnboost')
 *   .auth('tobi:learnboost')
 *   .auth('tobi')
 *   .auth(accessToken, { type: 'bearer' })
 *
 * @param {String} user
 * @param {String} [pass]
 * @param {Object} [options] options with authorization type 'basic' or 'bearer' ('basic' is default)
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.auth = function (user, pass, options) {
  if (arguments.length === 1) pass = '';
  if (typeof pass === 'object' && pass !== null) {
    // pass is optional and can be replaced with options
    options = pass;
    pass = '';
  }
  if (!options) {
    options = {
      type: 'basic'
    };
  }
  const encoder = string => Buffer.from(string).toString('base64');
  return this._auth(user, pass, options, encoder);
};

/**
 * Set the certificate authority option for https request.
 *
 * @param {Buffer | Array} cert
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.ca = function (cert) {
  this._ca = cert;
  return this;
};

/**
 * Set the client certificate key option for https request.
 *
 * @param {Buffer | String} cert
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.key = function (cert) {
  this._key = cert;
  return this;
};

/**
 * Set the key, certificate, and CA certs of the client in PFX or PKCS12 format.
 *
 * @param {Buffer | String} cert
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.pfx = function (cert) {
  if (typeof cert === 'object' && !Buffer.isBuffer(cert)) {
    this._pfx = cert.pfx;
    this._passphrase = cert.passphrase;
  } else {
    this._pfx = cert;
  }
  return this;
};

/**
 * Set the client certificate option for https request.
 *
 * @param {Buffer | String} cert
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.cert = function (cert) {
  this._cert = cert;
  return this;
};

/**
 * Do not reject expired or invalid TLS certs.
 * sets `rejectUnauthorized=true`. Be warned that this allows MITM attacks.
 *
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.disableTLSCerts = function () {
  this._disableTLSCerts = true;
  return this;
};

/**
 * Return an http[s] request.
 *
 * @return {OutgoingMessage}
 * @api private
 */

// eslint-disable-next-line complexity
Request.prototype.request = function () {
  if (this.req) return this.req;
  const options = {};
  try {
    const query = qs.stringify(this.qs, {
      indices: false,
      strictNullHandling: true
    });
    if (query) {
      this.qs = {};
      this._query.push(query);
    }
    this._finalizeQueryString();
  } catch (err) {
    return this.emit('error', err);
  }
  const urlString = withDefaultProtocol(this.url);
  const retries = this._retries;
  const protectedUrl = preserveDotSegments(urlString);
  const url = new URL(protectedUrl.urlString);
  let {
    protocol
  } = url;
  const path = protectedUrl.restorePath(`${url.pathname}${url.search}`);

  // support unix sockets
  if (/^https?\+unix:/.test(protocol) === true) {
    // get the protocol
    protocol = `${protocol.split('+')[0]}:`;
    if (!url.hostname) {
      throw new Error('Invalid unix socket URL: percent-encode the socket path by replacing "/" with "%2F".');
    }

    // get the socket path
    options.socketPath = url.hostname.replace(/%2F/g, '/');
    url.host = '';
    url.hostname = '';
  }

  // Override IP address of a hostname
  if (this._connectOverride) {
    const {
      hostname
    } = url;
    // the hostname may come from a redirect, so never let an inherited key
    // such as "constructor" act as an override entry
    const match = hasOwn(this._connectOverride, hostname) ? this._connectOverride[hostname] : this._connectOverride['*'];
    if (match) {
      // backup the real host
      if (!this._header.host) {
        this.set('host', url.host);
      }
      let newHost;
      let newPort;
      if (typeof match === 'object') {
        newHost = match.host;
        newPort = match.port;
      } else {
        newHost = match;
        newPort = url.port;
      }

      // wrap [ipv6]
      url.host = /:/.test(newHost) ? `[${newHost}]` : newHost;
      if (newPort) {
        url.host += `:${newPort}`;
        url.port = newPort;
      }
      url.hostname = newHost;
    }
  }

  // options
  options.method = this.method;
  options.port = url.port;
  options.path = path;
  options.host = utils.normalizeHostname(url.hostname); // ex: [::1] -> ::1
  // Apply user headers before connecting so invalid values (e.g. undefined)
  // throw without allocating a TCP handle. See #1827.
  // HTTP/2's wrapper forwards leftover options to http2.connect(), so only
  // do this on HTTP/1.
  if (!this._enableHttp2) {
    options.headers = {
      ...this.header
    };
  }
  options.ca = this._ca;
  options.key = this._key;
  options.pfx = this._pfx;
  options.cert = this._cert;
  options.passphrase = this._passphrase;
  options.agent = this._agent;
  options.lookup = this._lookup;
  options.rejectUnauthorized = typeof this._disableTLSCerts === 'boolean' ? !this._disableTLSCerts : process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0';

  // Allows request.get('https://1.2.3.4/').set('Host', 'example.com')
  if (this._header.host) {
    options.servername = this._header.host.replace(/:\d+$/, '');
  }
  if (this._trustLocalhost && /^(?:localhost|127\.0\.0\.\d+|(0*:)+:0*1)$/.test(url.hostname)) {
    options.rejectUnauthorized = false;
  }

  // initiate request
  const module_ = this._enableHttp2 ? exports.protocols['http2:'].setProtocol(protocol) : exports.protocols[protocol];

  // request
  this.req = module_.request(options);
  const {
    req
  } = this;

  // Attach this before header setup so destroy() during a setup exception
  // cannot emit an unhandled 'error' (or a second callback).
  req.on('error', error => {
    // flag abortion here for out timeouts
    // because node will emit a faux-error "socket hang up"
    // when request is aborted before a connection is made
    if (this._aborted || this._requestDisposed) return;
    // if not the same, we are in the **old** (cancelled) request,
    // so need to continue (same as for above)
    if (this._retries !== retries) return;
    // if we've received a response then we don't want to let
    // an error in the request blow up the response
    if (this.response) return;
    this.callback(error);
  });
  try {
    // set tcp no delay
    req.setNoDelay(true);
    if (options.method !== 'HEAD') {
      req.setHeader('Accept-Encoding', 'gzip, deflate');
    }
    this.protocol = protocol;
    this.host = url.host;

    // expose events
    const emitDrain = () => {
      this.emit('drain');
    };
    req.on('drain', emitDrain);
    req.once('close', () => {
      req.removeListener('drain', emitDrain);
    });

    // auth
    if (url.username || url.password) {
      this.auth(url.username, url.password);
    }
    if (this.username && this.password) {
      this.auth(this.username, this.password);
    }
    for (const key in this.header) {
      if (hasOwn(this.header, key)) req.setHeader(key, this.header[key]);
    }

    // add cookies
    if (this.cookies) {
      if (hasOwn(this._header, 'cookie')) {
        // merge
        const temporaryJar = new CookieJar.CookieJar();
        temporaryJar.setCookies(this._header.cookie.split('; '));
        temporaryJar.setCookies(this.cookies.split('; '));
        req.setHeader('Cookie', temporaryJar.getCookies(CookieJar.CookieAccessInfo.All).toValueString());
      } else {
        req.setHeader('Cookie', this.cookies);
      }
    }
    return req;
  } catch (err) {
    disposeNodeRequest(this);
    throw err;
  }
};

/**
 * Abort/end the Node request if it was created.
 *
 * @api private
 */
Request.prototype._disposeRequest = function () {
  disposeNodeRequest(this);
};

/**
 * Report a setup/request-path error without leaving the socket open.
 *
 * @param {Error} error
 * @api private
 */
Request.prototype._failRequest = function (error) {
  this._disposeRequest();
  if (typeof this._callback === 'function' && this._callback !== noop) {
    this.callback(error);
    return;
  }
  throw error;
};

/**
 * Invoke the callback with `err` and `res`
 * and handle arity check.
 *
 * @param {Error} err
 * @param {Response} res
 * @api private
 */

Request.prototype.callback = function (error, res) {
  if (this._shouldRetry(error, res)) {
    return this._retry();
  }

  // Avoid the error which is emitted from 'socket hang up' to cause the fn undefined error on JS runtime.
  const fn = this._callback || noop;
  this.clearTimeout();
  if (this.called) {
    if (this.timedout) return;
    return console.warn('superagent: double callback bug');
  }
  this.called = true;
  if (!error) {
    try {
      if (!this._isResponseOK(res)) {
        let message = 'Unsuccessful HTTP response';
        if (res) {
          message = http.STATUS_CODES[res.status] || message;
        }
        error = new Error(message);
        error.status = res ? res.status : undefined;
      }
    } catch (err) {
      error = err;
      error.status = error.status || (res ? res.status : undefined);
    }
  }

  // It's important that the callback is called outside try/catch
  // to avoid double callback
  if (!error) {
    return fn(null, res);
  }
  error.response = res;
  if (this._maxRetries) error.retries = this._retries - 1;

  // only emit error event if there is a listener
  // otherwise we assume the callback to `.end()` will get the error
  if (error && this.listeners('error').length > 0) {
    this.emit('error', error);
  }
  fn(error, res);
};

/**
 * Check if `obj` is a host object,
 *
 * @param {Object} obj host object
 * @return {Boolean} is a host object
 * @api private
 */
Request.prototype._isHost = function (object) {
  return Buffer.isBuffer(object) || object instanceof Stream || object instanceof FormData;
};

/**
 * Initiate request, invoking callback `fn(err, res)`
 * with an instanceof `Response`.
 *
 * @param {Function} fn
 * @return {Request} for chaining
 * @api public
 */

Request.prototype._emitResponse = function (body, files) {
  const response = new Response(this);
  this.response = response;
  response.redirects = this._redirectList;
  if (undefined !== body) {
    response.body = body;
  }
  response.files = files;
  if (this._endCalled) {
    response.pipe = function () {
      throw new Error("end() has already been called, so it's too late to start piping");
    };
  }
  this.emit('response', response);
  return response;
};

/**
 * Emit `redirect` event, passing an instanceof `Response`.
 *
 * @api private
 */

Request.prototype._emitRedirect = function () {
  const response = new Response(this);
  response.redirects = this._redirectList;
  this.emit('redirect', response);
};

/**
 * Emit a redirect response before the request URL is changed.
 *
 * @param {IncomingMessage} res
 * @api private
 */

Request.prototype._emitPreRedirect = function (res) {
  this.res = res;
  const response = new Response(this);
  response.redirects = this._redirectList;
  this.emit('pre-redirect', response);
};
Request.prototype.end = function (fn) {
  try {
    this.request();
  } catch (err) {
    this._endCalled = true;
    if (typeof fn === 'function') {
      this._callback = fn;
      this.callback(err);
      return;
    }
    throw err;
  }
  debug('%s %s', this.method, this.url);
  if (this._endCalled) {
    throw new Error('.end() was called twice. This is not supported in superagent');
  }
  this._endCalled = true;

  // store callback
  this._callback = fn || noop;
  this._end();
};
Request.prototype._end = function () {
  if (this._aborted) return this.callback(new Error('The request has been aborted even before .end() was called'));
  let data = this._data;
  const {
    req
  } = this;
  const {
    method
  } = this;
  this._setTimeouts();

  // body
  if (method !== 'HEAD' && !req._headerSent) {
    try {
      // serialize stuff
      if (typeof data !== 'string') {
        let contentType = req.getHeader('Content-Type');
        // Parse out just the content type from the header (ignore the charset)
        if (contentType) contentType = contentType.split(';')[0];
        let serialize = this._serializer || (hasOwn(exports.serialize, contentType) ? exports.serialize[contentType] : undefined);
        if (!serialize && isJSON(contentType)) {
          serialize = exports.serialize['application/json'];
        }
        if (serialize) data = serialize(data);
      }

      // content-length
      if (data && !req.getHeader('Content-Length')) {
        req.setHeader('Content-Length', Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data));
      }
    } catch (err) {
      return this._failRequest(err);
    }
  }
  let streamResponse;
  if (this._streamResponseListener) {
    req.removeListener('response', this._streamResponseListener);
    this._streamResponseListener = undefined;
    streamResponse = this._streamResponse;
    this._streamResponse = undefined;
  }

  // response
  // eslint-disable-next-line complexity
  const handleResponse = res => {
    debug('%s %s -> %s', this.method, this.url, res.statusCode);
    if (this._responseTimeoutTimer) {
      clearTimeout(this._responseTimeoutTimer);
    }
    if (this.piped) {
      return;
    }
    const max = this._maxRedirects;
    const mime = utils.type(res.headers['content-type'] || '') || 'text/plain';
    let type = mime.split('/')[0];
    if (type) type = type.toLowerCase().trim();
    const multipart = type === 'multipart';
    const redirect = isRedirect(res.statusCode);
    const responseType = this._responseType;
    this.res = res;

    // redirect
    if (redirect && this._redirects++ !== max) {
      return this._redirect(res);
    }
    if (this.method === 'HEAD') {
      this.emit('end');
      this.callback(null, this._emitResponse());
      return;
    }

    // zlib support
    let decompresser = null;
    if (this._shouldDecompress(res)) {
      decompresser = decompress(req, res);
    }
    let buffer = this._buffer;
    if (buffer === undefined && hasOwn(exports.buffer, mime)) {
      buffer = Boolean(exports.buffer[mime]);
    }
    let parser = this._parser;
    if (undefined === buffer && parser) {
      console.warn("A custom superagent parser has been set, but buffering strategy for the parser hasn't been configured. Call `req.buffer(true or false)` or set `superagent.buffer[mime] = true or false`");
      buffer = true;
    }
    if (!parser) {
      if (responseType) {
        parser = exports.parse.image; // It's actually a generic Buffer
        buffer = true;
      } else if (multipart) {
        const form = formidable.formidable();
        parser = (res, callback) => {
          // Create a PassThrough stream that acts as a proper HTTP request
          const bridgeStream = new Stream.PassThrough();

          // Add HTTP request properties from the current request context
          bridgeStream.method = this.method || 'POST';
          bridgeStream.url = this.url || '/';
          bridgeStream.httpVersion = res.httpVersion || '1.1';
          bridgeStream.headers = res.headers || {};
          bridgeStream.socket = res.socket || {
            readable: true
          };

          // Pipe the response data through the bridge stream
          res.pipe(bridgeStream);
          form.parse(bridgeStream, (err, fields, files) => {
            if (err) return callback(err);

            // Formidable v3 always returns arrays, but SuperAgent expects single values
            // Flatten single-item arrays to maintain backward compatibility
            const flattenedFields = {};
            if (fields) {
              for (const key in fields) {
                if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
                const value = fields[key];
                flattenedFields[key] = Array.isArray(value) && value.length === 1 ? value[0] : value;
              }
            }
            const flattenedFiles = {};
            if (files) {
              for (const key in files) {
                if (!Object.prototype.hasOwnProperty.call(files, key)) continue;
                const value = files[key];
                flattenedFiles[key] = Array.isArray(value) && value.length === 1 ? value[0] : value;
              }
            }

            // Return flattened fields as the object parameter to match SuperAgent's expected format
            callback(null, flattenedFields, flattenedFiles);
          });
        };
        buffer = true;
      } else if (isBinary(mime)) {
        parser = exports.parse.image;
        buffer = buffer !== false; // For backwards-compatibility buffering default is ad-hoc MIME-dependent
      } else if (hasOwn(exports.parse, mime)) {
        // `mime` is attacker controlled; an inherited key such as
        // "constructor" must not resolve to a parser
        parser = exports.parse[mime];
      } else if (type === 'text') {
        parser = exports.parse.text;
        buffer = buffer !== false;
        // everyone wants their own white-labeled json
      } else if (isJSON(mime)) {
        parser = exports.parse['application/json'];
        buffer = buffer !== false;
      } else if (buffer) {
        parser = exports.parse.text;
      } else if (undefined === buffer) {
        parser = exports.parse.image; // It's actually a generic Buffer
        buffer = true;
      }
    }

    // by default only buffer text/*, json and messed up thing from hell
    if (undefined === buffer && isText(mime) || isJSON(mime)) {
      buffer = true;
    }
    this._resBuffered = buffer;
    let parserHandlesEnd = false;
    if (buffer) {
      // Protection against zip bombs and other nuisance
      let responseBytesLeft = this._maxResponseSize || 200000000;
      let exceeded = false;
      res.on('data', buf => {
        if (exceeded) return;
        // Parsers may have called `setEncoding()`, in which case chunks are
        // strings: count their encoded size rather than their UTF-16 length
        responseBytesLeft -= Buffer.isBuffer(buf) ? buf.length : Buffer.byteLength(String(buf));
        if (responseBytesLeft < 0) {
          exceeded = true;
          const error = new Error('Maximum response size reached');
          error.code = 'ETOOLARGE';
          // Parsers aren't required to observe error event,
          // so would incorrectly report success
          parserHandlesEnd = false;
          // A decompression bomb keeps inflating (and emitting) long after
          // the compressed input was consumed; stop it here so the limit
          // also bounds CPU and avoids a flood of late callbacks.
          if (decompresser) decompresser.destroy();
          // Destroy without an error: IncomingMessage.destroy(err) emits
          // 'error', and the parser may also fail, each of which would
          // call callback() again ("superagent: double callback bug").
          res.destroy();
          this.callback(error, null);
        }
      });
    }
    if (parser && !buffer && BUFFERING_PARSERS.has(parser)) {
      // The built-in parsers exist only to accumulate the body. When the
      // response is not buffered (`.buffer(false)`, or an unbuffered default
      // such as application/octet-stream) they would still collect the entire
      // stream in memory, without any size limit, while the response has
      // already been handed out to the caller. Keep only the encoding they
      // would have applied so `res.on('data')` consumers see the same chunks.
      if (parser === BUILT_IN_PARSERS['application/x-www-form-urlencoded']) {
        res.setEncoding('ascii');
      } else if (parser !== BUILT_IN_PARSERS.image) {
        res.setEncoding('utf8');
      }
      parser = null;
    }
    if (parser) {
      try {
        // Unbuffered parsers are supposed to emit response early,
        // which is weird BTW, because response.body won't be there.
        parserHandlesEnd = buffer;
        parser(res, (error, object, files) => {
          if (this.timedout || this.called) {
            // Timeout or maxResponseSize has already handled all callbacks
            return;
          }

          // Intentional (non-timeout) abort is supposed to preserve partial response,
          // even if it doesn't parse.
          if (error && !this._aborted) {
            return this.callback(error);
          }
          if (parserHandlesEnd) {
            this.emit('end');
            this.callback(null, this._emitResponse(object, files));
          }
        });
      } catch (err) {
        this.callback(err);
        return;
      }
    }
    this.res = res;

    // unbuffered
    if (!buffer) {
      debug('unbuffered %s %s', this.method, this.url);
      this.callback(null, this._emitResponse());
      if (multipart) return; // allow multipart to handle end event
      res.once('end', () => {
        debug('end %s %s', this.method, this.url);
        this.emit('end');
      });
      return;
    }
    const completeAbortedResponse = () => {
      if (!this._aborted) {
        return false;
      }
      parserHandlesEnd = false;
      if (!this.called) {
        this.emit('end');
        const response = this._emitResponse();
        response.on('error', noop);
        this.callback(null, response);
      }
      return true;
    };

    // terminating events
    res.once('error', error => {
      if (completeAbortedResponse()) return;
      parserHandlesEnd = false;
      this.callback(error, null);
    });
    res.once('aborted', completeAbortedResponse);
    res.once('close', completeAbortedResponse);
    if (!parserHandlesEnd) res.once('end', () => {
      debug('end %s %s', this.method, this.url);
      // TODO: unless buffering emit earlier to stream
      this.emit('end');
      this.callback(null, this._emitResponse());
    });
  };
  if (streamResponse) {
    process.nextTick(handleResponse, streamResponse);
  } else {
    req.once('response', handleResponse);
  }
  this.emit('request', this);
  const getProgressMonitor = () => {
    const lengthComputable = true;
    const total = req.getHeader('Content-Length');
    let loaded = 0;
    const progress = new Stream.Transform();
    progress._transform = (chunk, encoding, callback) => {
      loaded += chunk.length;
      this.emit('progress', {
        direction: 'upload',
        lengthComputable,
        loaded,
        total
      });
      callback(null, chunk);
    };
    return progress;
  };
  const bufferToChunks = buffer => {
    const chunkSize = 16 * 1024; // default highWaterMark value
    const chunking = new Stream.Readable();
    const totalLength = buffer.length;
    const remainder = totalLength % chunkSize;
    const cutoff = totalLength - remainder;
    for (let i = 0; i < cutoff; i += chunkSize) {
      const chunk = buffer.slice(i, i + chunkSize);
      chunking.push(chunk);
    }
    if (remainder > 0) {
      const remainderBuffer = buffer.slice(-remainder);
      chunking.push(remainderBuffer);
    }
    chunking.push(null); // no more data

    return chunking;
  };
  try {
    // if a FormData instance got created, then we send that as the request body
    const formData = this._formData;
    if (formData) {
      // set headers
      const headers = formData.getHeaders();
      for (const i in headers) {
        if (hasOwn(headers, i)) {
          debug('setting FormData header: "%s: %s"', i, headers[i]);
          req.setHeader(i, headers[i]);
        }
      }

      // attempt to get "Content-Length" header
      formData.getLength((error, length) => {
        // Unknown stream lengths can use chunked encoding, but filesystem
        // errors must fail before a partial multipart request is sent.
        if (error && error !== 'Unknown stream') {
          this._failRequest(error);
          return;
        }
        debug('got FormData Content-Length: %s', length);
        if (typeof length === 'number') {
          req.setHeader('Content-Length', length);
        }
        formData.pipe(getProgressMonitor()).pipe(req);
      });
    } else if (Buffer.isBuffer(data)) {
      bufferToChunks(data).pipe(getProgressMonitor()).pipe(req);
    } else {
      req.end(data);
    }
  } catch (err) {
    this._failRequest(err);
  }
};

// Check whether response has a non-0-sized gzip-encoded body
Request.prototype._shouldDecompress = res => {
  return hasNonEmptyResponseContent(res) && (isGzipOrDeflateEncoding(res) || isBrotliEncoding(res));
};

/**
 * Overrides DNS for selected hostnames. Takes object mapping hostnames to IP addresses.
 *
 * When making a request to a URL with a hostname exactly matching a key in the object,
 * use the given IP address to connect, instead of using DNS to resolve the hostname.
 *
 * A special host `*` matches every hostname (keep redirects in mind!)
 *
 *      request.connect({
 *        'test.example.com': '127.0.0.1',
 *        'ipv6.example.com': '::1',
 *      })
 */
Request.prototype.connect = function (connectOverride) {
  if (typeof connectOverride === 'string') {
    this._connectOverride = {
      '*': connectOverride
    };
  } else if (typeof connectOverride === 'object') {
    this._connectOverride = connectOverride;
  } else {
    this._connectOverride = undefined;
  }
  return this;
};
Request.prototype.trustLocalhost = function (toggle) {
  this._trustLocalhost = toggle === undefined ? true : toggle;
  return this;
};

// generate HTTP verb methods
if (!methods.includes('del')) {
  // create a copy so we don't cause conflicts with
  // other packages using the methods package and
  // npm 3.x
  methods = [...methods];
  methods.push('del');
}
for (let method of methods) {
  const name = method;
  method = method === 'del' ? 'delete' : method;
  method = method.toUpperCase();
  request[name] = (url, data, fn) => {
    const request_ = request(method, url);
    if (typeof data === 'function') {
      fn = data;
      data = null;
    }
    if (data) {
      if (method === 'GET' || method === 'HEAD') {
        request_.query(data);
      } else {
        request_.send(data);
      }
    }
    if (fn) request_.end(fn);
    return request_;
  };
}

/**
 * Check if `mime` is text and should be buffered.
 *
 * @param {String} mime
 * @return {Boolean}
 * @api public
 */

function isText(mime) {
  const parts = mime.split('/');
  let type = parts[0];
  if (type) type = type.toLowerCase().trim();
  let subtype = parts[1];
  if (subtype) subtype = subtype.toLowerCase().trim();
  return type === 'text' || subtype === 'x-www-form-urlencoded';
}

// This is not a catchall, but a start. It might be useful
// in the long run to have file that includes all binary
// content types from https://www.iana.org/assignments/media-types/media-types.xhtml
function isBinary(mime) {
  let [registry, name] = mime.split('/');
  if (registry) registry = registry.toLowerCase().trim();
  if (name) name = name.toLowerCase().trim();
  return ['audio', 'font', 'image', 'video'].includes(registry) || ['gz', 'gzip'].includes(name);
}

/**
 * Check if `mime` is json or has +json structured syntax suffix.
 *
 * @param {String} mime
 * @return {Boolean}
 * @api private
 */

function isJSON(mime) {
  // should match /json or +json
  // but not /json-seq
  return /[/+]json($|[^-\w])/i.test(mime);
}

/**
 * Check if we should follow the redirect `code`.
 *
 * @param {Number} code
 * @return {Boolean}
 * @api private
 */

function isRedirect(code) {
  return [301, 302, 303, 305, 307, 308].includes(code);
}
function hasNonEmptyResponseContent(res) {
  if (res.statusCode === 204 || res.statusCode === 304) {
    // These aren't supposed to have any body
    return false;
  }

  // header content is a string, and distinction between 0 and no information is crucial
  if (res.headers['content-length'] === '0') {
    // We know that the body is empty (unfortunately, this check does not cover chunked encoding)
    return false;
  }
  return true;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJmb3JtYXQiLCJyZXF1aXJlIiwiU3RyZWFtIiwiaHR0cHMiLCJodHRwIiwiZnMiLCJ6bGliIiwidXRpbCIsInFzIiwibWltZSIsIm1ldGhvZHMiLCJGb3JtRGF0YSIsImZvcm1pZGFibGUiLCJkZWJ1ZyIsIkNvb2tpZUphciIsInNhZmVTdHJpbmdpZnkiLCJ1dGlscyIsIlJlcXVlc3RCYXNlIiwiaHR0cDIiLCJkZWNvbXByZXNzIiwiUmVzcG9uc2UiLCJtaXhpbiIsImhhc093biIsImlzQnJvdGxpRW5jb2RpbmciLCJpc0d6aXBPckRlZmxhdGVFbmNvZGluZyIsImNob29zZURlY29tcHJlc3NlciIsInJlcXVlc3QiLCJtZXRob2QiLCJ1cmwiLCJleHBvcnRzIiwiUmVxdWVzdCIsImVuZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsIm1vZHVsZSIsImFnZW50Iiwibm9vcCIsImRpc3Bvc2VOb2RlUmVxdWVzdCIsInJlcXVlc3RfIiwicmVxIiwiX3JlcXVlc3REaXNwb3NlZCIsIl9zdHJlYW1SZXNwb25zZUxpc3RlbmVyIiwicmVtb3ZlTGlzdGVuZXIiLCJ1bmRlZmluZWQiLCJfc3RyZWFtUmVzcG9uc2UiLCJzZXNzaW9uIiwiZGVzdHJveSIsInNvY2tldCIsImFib3J0IiwiZXJyIiwicHJlc2VydmVEb3RTZWdtZW50cyIsInVybFN0cmluZyIsInBhcnRzIiwibWF0Y2giLCJyZXN0b3JlUGF0aCIsInBhdGgiLCJzZWdtZW50cyIsInByZWZpeCIsInJlcGxhY2UiLCJfIiwic2VnbWVudCIsIm1hcmtlciIsInB1c2giLCJyZXF1ZXN0UGF0aCIsInJlc3RvcmVkUGF0aCIsImluZGV4IiwiZW50cmllcyIsIndpdGhEZWZhdWx0UHJvdG9jb2wiLCJpbmRleE9mIiwiUkVESVJFQ1RfUFJPVE9DT0xTIiwiU2V0IiwiVU5JWF9TT0NLRVRfUFJPVE9DT0xTIiwiaXNBbGxvd2VkUmVkaXJlY3RUYXJnZXQiLCJjdXJyZW50IiwidGFyZ2V0IiwiaGFzIiwicHJvdG9jb2wiLCJob3N0bmFtZSIsImlzU2FtZU9yaWdpbiIsIm9yaWdpbiIsInBvcnQiLCJkZWZpbmUiLCJwcm90b2NvbHMiLCJzZXJpYWxpemUiLCJhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQiLCJvYmplY3QiLCJzdHJpbmdpZnkiLCJpbmRpY2VzIiwic3RyaWN0TnVsbEhhbmRsaW5nIiwicGFyc2UiLCJCVUlMVF9JTl9QQVJTRVJTIiwidGV4dCIsImltYWdlIiwiQlVGRkVSSU5HX1BBUlNFUlMiLCJPYmplY3QiLCJrZXlzIiwibWFwIiwia2V5IiwiYnVmZmVyIiwiX2luaXRIZWFkZXJzIiwiX2hlYWRlciIsImhlYWRlciIsImNhbGwiLCJfZW5hYmxlSHR0cDIiLCJCb29sZWFuIiwicHJvY2VzcyIsImVudiIsIkhUVFAyX1RFU1QiLCJfYWdlbnQiLCJfZm9ybURhdGEiLCJ3cml0YWJsZSIsIl9yZWRpcmVjdHMiLCJyZWRpcmVjdHMiLCJjb29raWVzIiwiX3F1ZXJ5IiwicXNSYXciLCJfcmVkaXJlY3RMaXN0IiwiX3N0cmVhbVJlcXVlc3QiLCJfbG9va3VwIiwib25jZSIsImNsZWFyVGltZW91dCIsImJpbmQiLCJpbmhlcml0cyIsInByb3RvdHlwZSIsImJvb2wiLCJFcnJvciIsImF0dGFjaCIsImZpZWxkIiwiZmlsZSIsIm9wdGlvbnMiLCJfZGF0YSIsIm8iLCJmaWxlbmFtZSIsImNyZWF0ZVJlYWRTdHJlYW0iLCJvbiIsImVycm9yIiwiZm9ybURhdGEiLCJfZ2V0Rm9ybURhdGEiLCJlbWl0IiwiYXBwZW5kIiwiY2FsbGVkIiwiY2FsbGJhY2siLCJhZGRSZXF1ZXN0IiwiVHlwZUVycm9yIiwibG9va3VwIiwidHlwZSIsInNldCIsImluY2x1ZGVzIiwiZ2V0VHlwZSIsImFjY2VwdCIsInF1ZXJ5IiwidmFsdWUiLCJhc3NpZ24iLCJ3cml0ZSIsImRhdGEiLCJlbmNvZGluZyIsInJlcyIsInBpcGUiLCJzdHJlYW0iLCJwaXBlZCIsIl9waXBlQ29udGludWUiLCJpc1JlZGlyZWN0Iiwic3RhdHVzQ29kZSIsIl9tYXhSZWRpcmVjdHMiLCJfcmVkaXJlY3QiLCJfZW1pdFJlc3BvbnNlIiwiX2Fib3J0ZWQiLCJfc2hvdWxkRGVjb21wcmVzcyIsImRlY29tcHJlc3NlciIsImNvZGUiLCJfYnVmZmVyIiwiaGVhZGVycyIsImxvY2F0aW9uIiwicmVzdW1lIiwiVVJMIiwic3RhdHVzIiwiaHJlZiIsIl9lbWl0UHJlUmVkaXJlY3QiLCJnZXRIZWFkZXJzIiwiX2hlYWRlcnMiLCJjaGFuZ2VzT3JpZ2luIiwiY2xlYW5IZWFkZXIiLCJhdXRob3JpemF0aW9uIiwiY29va2llIiwidXNlcm5hbWUiLCJwYXNzd29yZCIsImhvc3QiLCJfZW5kQ2FsbGVkIiwiX2VtaXRSZWRpcmVjdCIsIl9jYWxsYmFjayIsImF1dGgiLCJ1c2VyIiwicGFzcyIsImVuY29kZXIiLCJzdHJpbmciLCJCdWZmZXIiLCJmcm9tIiwidG9TdHJpbmciLCJfYXV0aCIsImNhIiwiY2VydCIsIl9jYSIsIl9rZXkiLCJwZngiLCJpc0J1ZmZlciIsIl9wZngiLCJfcGFzc3BocmFzZSIsInBhc3NwaHJhc2UiLCJfY2VydCIsImRpc2FibGVUTFNDZXJ0cyIsIl9kaXNhYmxlVExTQ2VydHMiLCJfZmluYWxpemVRdWVyeVN0cmluZyIsInJldHJpZXMiLCJfcmV0cmllcyIsInByb3RlY3RlZFVybCIsInBhdGhuYW1lIiwic2VhcmNoIiwidGVzdCIsInNwbGl0Iiwic29ja2V0UGF0aCIsIl9jb25uZWN0T3ZlcnJpZGUiLCJuZXdIb3N0IiwibmV3UG9ydCIsIm5vcm1hbGl6ZUhvc3RuYW1lIiwicmVqZWN0VW5hdXRob3JpemVkIiwiTk9ERV9UTFNfUkVKRUNUX1VOQVVUSE9SSVpFRCIsInNlcnZlcm5hbWUiLCJfdHJ1c3RMb2NhbGhvc3QiLCJtb2R1bGVfIiwic2V0UHJvdG9jb2wiLCJyZXNwb25zZSIsInNldE5vRGVsYXkiLCJzZXRIZWFkZXIiLCJlbWl0RHJhaW4iLCJ0ZW1wb3JhcnlKYXIiLCJzZXRDb29raWVzIiwiZ2V0Q29va2llcyIsIkNvb2tpZUFjY2Vzc0luZm8iLCJBbGwiLCJ0b1ZhbHVlU3RyaW5nIiwiX2Rpc3Bvc2VSZXF1ZXN0IiwiX2ZhaWxSZXF1ZXN0IiwiX3Nob3VsZFJldHJ5IiwiX3JldHJ5IiwiZm4iLCJ0aW1lZG91dCIsImNvbnNvbGUiLCJ3YXJuIiwiX2lzUmVzcG9uc2VPSyIsIm1lc3NhZ2UiLCJTVEFUVVNfQ09ERVMiLCJfbWF4UmV0cmllcyIsImxpc3RlbmVycyIsIl9pc0hvc3QiLCJib2R5IiwiZmlsZXMiLCJfZW5kIiwiX3NldFRpbWVvdXRzIiwiX2hlYWRlclNlbnQiLCJjb250ZW50VHlwZSIsImdldEhlYWRlciIsIl9zZXJpYWxpemVyIiwiaXNKU09OIiwiYnl0ZUxlbmd0aCIsInN0cmVhbVJlc3BvbnNlIiwiaGFuZGxlUmVzcG9uc2UiLCJfcmVzcG9uc2VUaW1lb3V0VGltZXIiLCJtYXgiLCJ0b0xvd2VyQ2FzZSIsInRyaW0iLCJtdWx0aXBhcnQiLCJyZWRpcmVjdCIsInJlc3BvbnNlVHlwZSIsIl9yZXNwb25zZVR5cGUiLCJwYXJzZXIiLCJfcGFyc2VyIiwiZm9ybSIsImJyaWRnZVN0cmVhbSIsIlBhc3NUaHJvdWdoIiwiaHR0cFZlcnNpb24iLCJyZWFkYWJsZSIsImZpZWxkcyIsImZsYXR0ZW5lZEZpZWxkcyIsImhhc093blByb3BlcnR5IiwiQXJyYXkiLCJpc0FycmF5IiwiZmxhdHRlbmVkRmlsZXMiLCJpc0JpbmFyeSIsImlzVGV4dCIsIl9yZXNCdWZmZXJlZCIsInBhcnNlckhhbmRsZXNFbmQiLCJyZXNwb25zZUJ5dGVzTGVmdCIsIl9tYXhSZXNwb25zZVNpemUiLCJleGNlZWRlZCIsImJ1ZiIsIlN0cmluZyIsInNldEVuY29kaW5nIiwiY29tcGxldGVBYm9ydGVkUmVzcG9uc2UiLCJuZXh0VGljayIsImdldFByb2dyZXNzTW9uaXRvciIsImxlbmd0aENvbXB1dGFibGUiLCJ0b3RhbCIsImxvYWRlZCIsInByb2dyZXNzIiwiVHJhbnNmb3JtIiwiX3RyYW5zZm9ybSIsImNodW5rIiwiZGlyZWN0aW9uIiwiYnVmZmVyVG9DaHVua3MiLCJjaHVua1NpemUiLCJjaHVua2luZyIsIlJlYWRhYmxlIiwidG90YWxMZW5ndGgiLCJyZW1haW5kZXIiLCJjdXRvZmYiLCJpIiwic2xpY2UiLCJyZW1haW5kZXJCdWZmZXIiLCJnZXRMZW5ndGgiLCJoYXNOb25FbXB0eVJlc3BvbnNlQ29udGVudCIsImNvbm5lY3QiLCJjb25uZWN0T3ZlcnJpZGUiLCJ0cnVzdExvY2FsaG9zdCIsInRvZ2dsZSIsIm5hbWUiLCJ0b1VwcGVyQ2FzZSIsInNlbmQiLCJzdWJ0eXBlIiwicmVnaXN0cnkiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvbm9kZS9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxuY29uc3QgeyBmb3JtYXQgfSA9IHJlcXVpcmUoJ25vZGU6dXJsJyk7XG5jb25zdCBTdHJlYW0gPSByZXF1aXJlKCdub2RlOnN0cmVhbScpO1xuY29uc3QgaHR0cHMgPSByZXF1aXJlKCdub2RlOmh0dHBzJyk7XG5jb25zdCBodHRwID0gcmVxdWlyZSgnbm9kZTpodHRwJyk7XG5jb25zdCBmcyA9IHJlcXVpcmUoJ25vZGU6ZnMnKTtcbmNvbnN0IHpsaWIgPSByZXF1aXJlKCdub2RlOnpsaWInKTtcbmNvbnN0IHV0aWwgPSByZXF1aXJlKCdub2RlOnV0aWwnKTtcbmNvbnN0IHFzID0gcmVxdWlyZSgncXMnKTtcbmNvbnN0IG1pbWUgPSByZXF1aXJlKCdtaW1lJyk7XG5sZXQgbWV0aG9kcyA9IHJlcXVpcmUoJ21ldGhvZHMnKTtcbmNvbnN0IEZvcm1EYXRhID0gcmVxdWlyZSgnZm9ybS1kYXRhJyk7XG5jb25zdCBmb3JtaWRhYmxlID0gcmVxdWlyZSgnZm9ybWlkYWJsZScpO1xuY29uc3QgZGVidWcgPSByZXF1aXJlKCdkZWJ1ZycpKCdzdXBlcmFnZW50Jyk7XG5jb25zdCBDb29raWVKYXIgPSByZXF1aXJlKCdjb29raWVqYXInKTtcbmNvbnN0IHNhZmVTdHJpbmdpZnkgPSByZXF1aXJlKCdmYXN0LXNhZmUtc3RyaW5naWZ5Jyk7XG5cbmNvbnN0IHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMnKTtcbmNvbnN0IFJlcXVlc3RCYXNlID0gcmVxdWlyZSgnLi4vcmVxdWVzdC1iYXNlJyk7XG5jb25zdCBodHRwMiA9IHJlcXVpcmUoJy4vaHR0cDJ3cmFwcGVyJyk7XG5jb25zdCB7IGRlY29tcHJlc3MgfSA9IHJlcXVpcmUoJy4vdW56aXAnKTtcbmNvbnN0IFJlc3BvbnNlID0gcmVxdWlyZSgnLi9yZXNwb25zZScpO1xuXG5jb25zdCB7IG1peGluLCBoYXNPd24sIGlzQnJvdGxpRW5jb2RpbmcsIGlzR3ppcE9yRGVmbGF0ZUVuY29kaW5nIH0gPSB1dGlscztcbmNvbnN0IHsgY2hvb3NlRGVjb21wcmVzc2VyIH0gPSByZXF1aXJlKCcuL2RlY29tcHJlc3MnKTtcblxuZnVuY3Rpb24gcmVxdWVzdChtZXRob2QsIHVybCkge1xuICAvLyBjYWxsYmFja1xuICBpZiAodHlwZW9mIHVybCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybiBuZXcgZXhwb3J0cy5SZXF1ZXN0KCdHRVQnLCBtZXRob2QpLmVuZCh1cmwpO1xuICB9XG5cbiAgLy8gdXJsIGZpcnN0XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIG5ldyBleHBvcnRzLlJlcXVlc3QoJ0dFVCcsIG1ldGhvZCk7XG4gIH1cblxuICByZXR1cm4gbmV3IGV4cG9ydHMuUmVxdWVzdChtZXRob2QsIHVybCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gcmVxdWVzdDtcbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cztcblxuLyoqXG4gKiBFeHBvc2UgYFJlcXVlc3RgLlxuICovXG5cbmV4cG9ydHMuUmVxdWVzdCA9IFJlcXVlc3Q7XG5cbi8qKlxuICogRXhwb3NlIHRoZSBhZ2VudCBmdW5jdGlvblxuICovXG5cbmV4cG9ydHMuYWdlbnQgPSByZXF1aXJlKCcuL2FnZW50Jyk7XG5cbi8qKlxuICogTm9vcC5cbiAqL1xuXG5mdW5jdGlvbiBub29wKCkge31cblxuLyoqXG4gKiBDbG9zZSBhbiB1bmRlcmx5aW5nIE5vZGUgcmVxdWVzdC9zZXNzaW9uIGNyZWF0ZWQgZHVyaW5nIHNldHVwLlxuICpcbiAqIFVzZWQgd2hlbiBoZWFkZXIgYXBwbGljYXRpb24gb3IgbGF0ZXIgcmVxdWVzdC1wYXRoIHdvcmsgdGhyb3dzIGFmdGVyXG4gKiBgaHR0cC5yZXF1ZXN0KClgIC8gYGh0dHAyLmNvbm5lY3QoKWAgaGFzIGFscmVhZHkgYWxsb2NhdGVkIGEgc29ja2V0LlxuICpcbiAqIEBwYXJhbSB7UmVxdWVzdH0gcmVxdWVzdF9cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBkaXNwb3NlTm9kZVJlcXVlc3QocmVxdWVzdF8pIHtcbiAgY29uc3QgeyByZXEgfSA9IHJlcXVlc3RfO1xuICBpZiAoIXJlcSB8fCByZXF1ZXN0Xy5fcmVxdWVzdERpc3Bvc2VkKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcmVxdWVzdF8uX3JlcXVlc3REaXNwb3NlZCA9IHRydWU7XG4gIGlmIChyZXF1ZXN0Xy5fc3RyZWFtUmVzcG9uc2VMaXN0ZW5lcikge1xuICAgIHJlcS5yZW1vdmVMaXN0ZW5lcigncmVzcG9uc2UnLCByZXF1ZXN0Xy5fc3RyZWFtUmVzcG9uc2VMaXN0ZW5lcik7XG4gICAgcmVxdWVzdF8uX3N0cmVhbVJlc3BvbnNlTGlzdGVuZXIgPSB1bmRlZmluZWQ7XG4gICAgcmVxdWVzdF8uX3N0cmVhbVJlc3BvbnNlID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBIVFRQLzIgd3JhcHBlciBrZWVwcyBhIHNlc3Npb24gb3BlbiBhcyBzb29uIGFzIHJlcXVlc3QoKSBpcyBjYWxsZWQuXG4gICAgLy8gUHJlZmVyIGRlc3Ryb3lpbmcgdGhhdCBzZXNzaW9uIHNvIHdlIG5ldmVyIGNhbGwgYWJvcnQoKSDihpIgZ2V0RnJhbWUoKVxuICAgIC8vIHdpdGggaW52YWxpZCBoZWFkZXJzICh3aGljaCB3b3VsZCBlbWl0IGEgbGF0ZSBwcm90b2NvbCBlcnJvcikuXG4gICAgaWYgKHJlcS5zZXNzaW9uICYmIHR5cGVvZiByZXEuc2Vzc2lvbi5kZXN0cm95ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICByZXEuc2Vzc2lvbi5kZXN0cm95KCk7XG4gICAgfVxuXG4gICAgaWYgKHJlcS5zb2NrZXQgJiYgdHlwZW9mIHJlcS5zb2NrZXQuZGVzdHJveSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmVxLnNvY2tldC5kZXN0cm95KCk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiByZXEuZGVzdHJveSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmVxLmRlc3Ryb3koKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIHJlcS5hYm9ydCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmVxLmFib3J0KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiByZXEuZW5kID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICByZXEuZW5kKCk7XG4gICAgfVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICBkZWJ1ZygnZXJyb3IgZGlzcG9zaW5nIHJlcXVlc3QgYWZ0ZXIgc2V0dXAgZmFpbHVyZScsIGVycik7XG4gIH1cbn1cblxuLyoqXG4gKiBQcmVzZXJ2ZSBkb3Qtb25seSBwYXRoIHNlZ21lbnRzIHRoYXQgV0hBVFdHIFVSTCBub3JtYWxpemVzIGF3YXkuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVybFN0cmluZ1xuICogQHJldHVybnMge3t1cmxTdHJpbmc6IFN0cmluZywgcmVzdG9yZVBhdGg6IEZ1bmN0aW9ufX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBwcmVzZXJ2ZURvdFNlZ21lbnRzKHVybFN0cmluZykge1xuICBjb25zdCBwYXJ0cyA9IHVybFN0cmluZy5tYXRjaChcbiAgICAvXihbYS16XVthLXpcXGQrLi1dKjpcXC9cXC9bXi8/I10qKShbXj8jXSopKC4qKSQvaVxuICApO1xuICBpZiAoIXBhcnRzKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHVybFN0cmluZyxcbiAgICAgIHJlc3RvcmVQYXRoKHBhdGgpIHtcbiAgICAgICAgcmV0dXJuIHBhdGg7XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHNlZ21lbnRzID0gW107XG4gIGNvbnN0IHByZWZpeCA9ICdfX3N1cGVyYWdlbnRfZG90X3NlZ21lbnRfJztcbiAgY29uc3QgcGF0aCA9IHBhcnRzWzJdLnJlcGxhY2UoXG4gICAgL1xcLygoPzpcXC58JTJlKXsxLDJ9KSg/PVxcL3wkKS9naSxcbiAgICAoXywgc2VnbWVudCkgPT4ge1xuICAgICAgY29uc3QgbWFya2VyID0gYCR7cHJlZml4fSR7c2VnbWVudHMubGVuZ3RofV9fYDtcbiAgICAgIHNlZ21lbnRzLnB1c2goc2VnbWVudCk7XG4gICAgICByZXR1cm4gYC8ke21hcmtlcn1gO1xuICAgIH1cbiAgKTtcblxuICByZXR1cm4ge1xuICAgIHVybFN0cmluZzogYCR7cGFydHNbMV19JHtwYXRofSR7cGFydHNbM119YCxcbiAgICByZXN0b3JlUGF0aChyZXF1ZXN0UGF0aCkge1xuICAgICAgbGV0IHJlc3RvcmVkUGF0aCA9IHJlcXVlc3RQYXRoO1xuICAgICAgZm9yIChjb25zdCBbaW5kZXgsIHNlZ21lbnRdIG9mIHNlZ21lbnRzLmVudHJpZXMoKSkge1xuICAgICAgICByZXN0b3JlZFBhdGggPSByZXN0b3JlZFBhdGgucmVwbGFjZShgJHtwcmVmaXh9JHtpbmRleH1fX2AsIHNlZ21lbnQpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVzdG9yZWRQYXRoO1xuICAgIH1cbiAgfTtcbn1cblxuLyoqXG4gKiBEZWZhdWx0IGEgc2NoZW1lLWxlc3MgVVJMIHN0cmluZyB0byBodHRwOi8vLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmxTdHJpbmdcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5mdW5jdGlvbiB3aXRoRGVmYXVsdFByb3RvY29sKHVybFN0cmluZykge1xuICByZXR1cm4gdXJsU3RyaW5nLmluZGV4T2YoJ2h0dHAnKSA9PT0gMCA/IHVybFN0cmluZyA6IGBodHRwOi8vJHt1cmxTdHJpbmd9YDtcbn1cblxuLyoqXG4gKiBQcm90b2NvbHMgYSByZWRpcmVjdCBtYXkgbGVhZCB0by4gQSByZXF1ZXN0IG1hZGUgb3ZlciBhIFVuaXggZG9tYWluIHNvY2tldFxuICogbWF5IGFkZGl0aW9uYWxseSBiZSByZWRpcmVjdGVkIHdpdGhpbiB0aGF0IHNhbWUgc29ja2V0IChzZWVcbiAqIGBpc0FsbG93ZWRSZWRpcmVjdFRhcmdldGApLlxuICovXG5jb25zdCBSRURJUkVDVF9QUk9UT0NPTFMgPSBuZXcgU2V0KFsnaHR0cDonLCAnaHR0cHM6J10pO1xuY29uc3QgVU5JWF9TT0NLRVRfUFJPVE9DT0xTID0gbmV3IFNldChbJ2h0dHArdW5peDonLCAnaHR0cHMrdW5peDonXSk7XG5cbi8qKlxuICogV2hldGhlciBhIHJlZGlyZWN0IGZyb20gYGN1cnJlbnRgIHRvIGB0YXJnZXRgIG1heSBiZSBmb2xsb3dlZC5cbiAqXG4gKiBPbmx5IGh0dHAocykgdGFyZ2V0cyBhcmUgZm9sbG93ZWQuIEEgcmVtb3RlIHNlcnZlciBtdXN0IG5ldmVyIGJlIGFibGUgdG9cbiAqIHN0ZWVyIHRoZSBjbGllbnQgaW50byBhIGxvY2FsIFVuaXggZG9tYWluIHNvY2tldCAoYGh0dHArdW5peDovL2ApIG9yIGFueVxuICogb3RoZXIgc2NoZW1lIHRocm91Z2ggYSBMb2NhdGlvbiBoZWFkZXI7IGEgcmVxdWVzdCB0aGF0IHdhcyBpdHNlbGYgbWFkZSBvdmVyXG4gKiBhIFVuaXggZG9tYWluIHNvY2tldCBtYXkgb25seSBiZSByZWRpcmVjdGVkIHdpdGhpbiB0aGF0IHNhbWUgc29ja2V0LlxuICpcbiAqIEBwYXJhbSB7VVJMfSBjdXJyZW50XG4gKiBAcGFyYW0ge1VSTH0gdGFyZ2V0XG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIGlzQWxsb3dlZFJlZGlyZWN0VGFyZ2V0KGN1cnJlbnQsIHRhcmdldCkge1xuICBpZiAoUkVESVJFQ1RfUFJPVE9DT0xTLmhhcyh0YXJnZXQucHJvdG9jb2wpKSByZXR1cm4gdHJ1ZTtcblxuICByZXR1cm4gKFxuICAgIFVOSVhfU09DS0VUX1BST1RPQ09MUy5oYXModGFyZ2V0LnByb3RvY29sKSAmJlxuICAgIHRhcmdldC5wcm90b2NvbCA9PT0gY3VycmVudC5wcm90b2NvbCAmJlxuICAgIHRhcmdldC5ob3N0bmFtZSAhPT0gJycgJiZcbiAgICB0YXJnZXQuaG9zdG5hbWUgPT09IGN1cnJlbnQuaG9zdG5hbWVcbiAgKTtcbn1cblxuLyoqXG4gKiBXaGV0aGVyIHR3byBVUkxzIHNoYXJlIGFuIG9yaWdpbi4gVW5peCBzb2NrZXQgVVJMcyBoYXZlIGFuIG9wYXF1ZSAoYG51bGxgKVxuICogV0hBVFdHIG9yaWdpbiwgc28gdGhleSBhcmUgY29tcGFyZWQgYnkgcHJvdG9jb2wgYW5kIHNvY2tldCBwYXRoIGluc3RlYWQuXG4gKlxuICogQHBhcmFtIHtVUkx9IGN1cnJlbnRcbiAqIEBwYXJhbSB7VVJMfSB0YXJnZXRcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gaXNTYW1lT3JpZ2luKGN1cnJlbnQsIHRhcmdldCkge1xuICBpZiAoY3VycmVudC5vcmlnaW4gIT09ICdudWxsJyAmJiB0YXJnZXQub3JpZ2luICE9PSAnbnVsbCcpIHtcbiAgICByZXR1cm4gY3VycmVudC5vcmlnaW4gPT09IHRhcmdldC5vcmlnaW47XG4gIH1cblxuICByZXR1cm4gKFxuICAgIGN1cnJlbnQucHJvdG9jb2wgPT09IHRhcmdldC5wcm90b2NvbCAmJlxuICAgIGN1cnJlbnQuaG9zdG5hbWUgPT09IHRhcmdldC5ob3N0bmFtZSAmJlxuICAgIGN1cnJlbnQucG9ydCA9PT0gdGFyZ2V0LnBvcnRcbiAgKTtcbn1cblxuLyoqXG4gKiBFeHBvc2UgYFJlc3BvbnNlYC5cbiAqL1xuXG5leHBvcnRzLlJlc3BvbnNlID0gUmVzcG9uc2U7XG5cbi8qKlxuICogRGVmaW5lIFwiZm9ybVwiIG1pbWUgdHlwZS5cbiAqL1xuXG5taW1lLmRlZmluZShcbiAge1xuICAgICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnOiBbJ2Zvcm0nLCAndXJsZW5jb2RlZCcsICdmb3JtLWRhdGEnXVxuICB9LFxuICB0cnVlXG4pO1xuXG4vKipcbiAqIFByb3RvY29sIG1hcC5cbiAqL1xuXG5leHBvcnRzLnByb3RvY29scyA9IHtcbiAgJ2h0dHA6JzogaHR0cCxcbiAgJ2h0dHBzOic6IGh0dHBzLFxuICAnaHR0cDI6JzogaHR0cDJcbn07XG5cbi8qKlxuICogRGVmYXVsdCBzZXJpYWxpemF0aW9uIG1hcC5cbiAqXG4gKiAgICAgc3VwZXJhZ2VudC5zZXJpYWxpemVbJ2FwcGxpY2F0aW9uL3htbCddID0gZnVuY3Rpb24ob2JqKXtcbiAqICAgICAgIHJldHVybiAnZ2VuZXJhdGVkIHhtbCBoZXJlJztcbiAqICAgICB9O1xuICpcbiAqL1xuXG5leHBvcnRzLnNlcmlhbGl6ZSA9IHtcbiAgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcob2JqZWN0KSB7XG4gICAgcmV0dXJuIHFzLnN0cmluZ2lmeShvYmplY3QsIHsgaW5kaWNlczogZmFsc2UsIHN0cmljdE51bGxIYW5kbGluZzogdHJ1ZSB9KTtcbiAgfSxcbiAgJ2FwcGxpY2F0aW9uL2pzb24nOiBzYWZlU3RyaW5naWZ5LFxuICAvLyBDU1AgcmVwb3J0cyBjYXJyeSBKU09OIGJvZGllcyBidXQgdXNlIGEgZGlzdGluY3QgcmVnaXN0ZXJlZCBtZWRpYSB0eXBlLlxuICAnYXBwbGljYXRpb24vY3NwLXJlcG9ydCc6IHNhZmVTdHJpbmdpZnlcbn07XG5cbi8qKlxuICogRGVmYXVsdCBwYXJzZXJzLlxuICpcbiAqICAgICBzdXBlcmFnZW50LnBhcnNlWydhcHBsaWNhdGlvbi94bWwnXSA9IGZ1bmN0aW9uKHJlcywgZm4pe1xuICogICAgICAgZm4obnVsbCwgcmVzKTtcbiAqICAgICB9O1xuICpcbiAqL1xuXG5leHBvcnRzLnBhcnNlID0gcmVxdWlyZSgnLi9wYXJzZXJzJyk7XG5cbi8qKlxuICogVGhlIGRlZmF1bHQgcGFyc2VycyBhcyBzaGlwcGVkOyB0aGV5IG9ubHkgYWNjdW11bGF0ZSBhIGJ1ZmZlcmVkIGJvZHksIHNvXG4gKiB0aGV5IGFyZSBza2lwcGVkIGZvciB1bmJ1ZmZlcmVkIHJlc3BvbnNlcyAoc2VlIGBfZW5kYCkuIENhcHR1cmVkIGhlcmUgc29cbiAqIHRoYXQgYSBwYXJzZXIgYSB1c2VyIGluc3RhbGxzIHVuZGVyIHRoZSBzYW1lIGtleSBpcyBzdGlsbCBob25vdXJlZC5cbiAqL1xuY29uc3QgQlVJTFRfSU5fUEFSU0VSUyA9IHtcbiAgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCc6XG4gICAgZXhwb3J0cy5wYXJzZVsnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJ10sXG4gICdhcHBsaWNhdGlvbi9qc29uJzogZXhwb3J0cy5wYXJzZVsnYXBwbGljYXRpb24vanNvbiddLFxuICB0ZXh0OiBleHBvcnRzLnBhcnNlLnRleHQsXG4gIGltYWdlOiBleHBvcnRzLnBhcnNlLmltYWdlXG59O1xuY29uc3QgQlVGRkVSSU5HX1BBUlNFUlMgPSBuZXcgU2V0KFxuICBPYmplY3Qua2V5cyhCVUlMVF9JTl9QQVJTRVJTKS5tYXAoKGtleSkgPT4gQlVJTFRfSU5fUEFSU0VSU1trZXldKVxuKTtcblxuLyoqXG4gKiBEZWZhdWx0IGJ1ZmZlcmluZyBtYXAuIENhbiBiZSB1c2VkIHRvIHNldCBjZXJ0YWluXG4gKiByZXNwb25zZSB0eXBlcyB0byBidWZmZXIvbm90IGJ1ZmZlci5cbiAqXG4gKiAgICAgc3VwZXJhZ2VudC5idWZmZXJbJ2FwcGxpY2F0aW9uL3htbCddID0gdHJ1ZTtcbiAqL1xuZXhwb3J0cy5idWZmZXIgPSB7fTtcblxuLyoqXG4gKiBJbml0aWFsaXplIGludGVybmFsIGhlYWRlciB0cmFja2luZyBwcm9wZXJ0aWVzIG9uIGEgcmVxdWVzdCBpbnN0YW5jZS5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gcmVxIHRoZSBpbnN0YW5jZVxuICogQGFwaSBwcml2YXRlXG4gKi9cbmZ1bmN0aW9uIF9pbml0SGVhZGVycyhyZXF1ZXN0Xykge1xuICByZXF1ZXN0Xy5faGVhZGVyID0ge1xuICAgIC8vIGNvZXJjZXMgaGVhZGVyIG5hbWVzIHRvIGxvd2VyY2FzZVxuICB9O1xuICByZXF1ZXN0Xy5oZWFkZXIgPSB7XG4gICAgLy8gcHJlc2VydmVzIGhlYWRlciBuYW1lIGNhc2VcbiAgfTtcbn1cblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBSZXF1ZXN0YCB3aXRoIHRoZSBnaXZlbiBgbWV0aG9kYCBhbmQgYHVybGAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG1ldGhvZFxuICogQHBhcmFtIHtTdHJpbmd8T2JqZWN0fSB1cmxcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gUmVxdWVzdChtZXRob2QsIHVybCkge1xuICBTdHJlYW0uY2FsbCh0aGlzKTtcbiAgaWYgKHR5cGVvZiB1cmwgIT09ICdzdHJpbmcnKSB1cmwgPSBmb3JtYXQodXJsKTtcbiAgdGhpcy5fZW5hYmxlSHR0cDIgPSBCb29sZWFuKHByb2Nlc3MuZW52LkhUVFAyX1RFU1QpOyAvLyBpbnRlcm5hbCBvbmx5XG4gIHRoaXMuX2FnZW50ID0gZmFsc2U7XG4gIHRoaXMuX2Zvcm1EYXRhID0gbnVsbDtcbiAgdGhpcy5tZXRob2QgPSBtZXRob2Q7XG4gIHRoaXMudXJsID0gdXJsO1xuICBfaW5pdEhlYWRlcnModGhpcyk7XG4gIHRoaXMud3JpdGFibGUgPSB0cnVlO1xuICB0aGlzLl9yZWRpcmVjdHMgPSAwO1xuICB0aGlzLnJlZGlyZWN0cyhtZXRob2QgPT09ICdIRUFEJyA/IDAgOiA1KTtcbiAgdGhpcy5jb29raWVzID0gJyc7XG4gIHRoaXMucXMgPSB7fTtcbiAgdGhpcy5fcXVlcnkgPSBbXTtcbiAgdGhpcy5xc1JhdyA9IHRoaXMuX3F1ZXJ5OyAvLyBVbnVzZWQsIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBvbmx5XG4gIHRoaXMuX3JlZGlyZWN0TGlzdCA9IFtdO1xuICB0aGlzLl9zdHJlYW1SZXF1ZXN0ID0gZmFsc2U7XG4gIHRoaXMuX2xvb2t1cCA9IHVuZGVmaW5lZDtcbiAgdGhpcy5vbmNlKCdlbmQnLCB0aGlzLmNsZWFyVGltZW91dC5iaW5kKHRoaXMpKTtcbn1cblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYFN0cmVhbWAgKHdoaWNoIGluaGVyaXRzIGZyb20gYEV2ZW50RW1pdHRlcmApLlxuICogTWl4aW4gYFJlcXVlc3RCYXNlYC5cbiAqL1xudXRpbC5pbmhlcml0cyhSZXF1ZXN0LCBTdHJlYW0pO1xuXG5taXhpbihSZXF1ZXN0LnByb3RvdHlwZSwgUmVxdWVzdEJhc2UucHJvdG90eXBlKTtcblxuLyoqXG4gKiBFbmFibGUgb3IgRGlzYWJsZSBodHRwMi5cbiAqXG4gKiBFbmFibGUgaHR0cDIuXG4gKlxuICogYGBgIGpzXG4gKiByZXF1ZXN0LmdldCgnaHR0cDovL2xvY2FsaG9zdC8nKVxuICogICAuaHR0cDIoKVxuICogICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiByZXF1ZXN0LmdldCgnaHR0cDovL2xvY2FsaG9zdC8nKVxuICogICAuaHR0cDIodHJ1ZSlcbiAqICAgLmVuZChjYWxsYmFjayk7XG4gKiBgYGBcbiAqXG4gKiBEaXNhYmxlIGh0dHAyLlxuICpcbiAqIGBgYCBqc1xuICogcmVxdWVzdCA9IHJlcXVlc3QuaHR0cDIoKTtcbiAqIHJlcXVlc3QuZ2V0KCdodHRwOi8vbG9jYWxob3N0LycpXG4gKiAgIC5odHRwMihmYWxzZSlcbiAqICAgLmVuZChjYWxsYmFjayk7XG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0ge0Jvb2xlYW59IGVuYWJsZVxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmh0dHAyID0gZnVuY3Rpb24gKGJvb2wpIHtcbiAgaWYgKGV4cG9ydHMucHJvdG9jb2xzWydodHRwMjonXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgJ3N1cGVyYWdlbnQ6IHRoaXMgdmVyc2lvbiBvZiBOb2RlLmpzIGRvZXMgbm90IHN1cHBvcnQgaHR0cDInXG4gICAgKTtcbiAgfVxuXG4gIHRoaXMuX2VuYWJsZUh0dHAyID0gYm9vbCA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IGJvb2w7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBRdWV1ZSB0aGUgZ2l2ZW4gYGZpbGVgIGFzIGFuIGF0dGFjaG1lbnQgdG8gdGhlIHNwZWNpZmllZCBgZmllbGRgLFxuICogd2l0aCBvcHRpb25hbCBgb3B0aW9uc2AgKG9yIGZpbGVuYW1lKS5cbiAqXG4gKiBgYGAganNcbiAqIHJlcXVlc3QucG9zdCgnaHR0cDovL2xvY2FsaG9zdC91cGxvYWQnKVxuICogICAuYXR0YWNoKCdmaWVsZCcsIEJ1ZmZlci5mcm9tKCc8Yj5IZWxsbyB3b3JsZDwvYj4nKSwgJ2hlbGxvLmh0bWwnKVxuICogICAuZW5kKGNhbGxiYWNrKTtcbiAqIGBgYFxuICpcbiAqIEEgZmlsZW5hbWUgbWF5IGFsc28gYmUgdXNlZDpcbiAqXG4gKiBgYGAganNcbiAqIHJlcXVlc3QucG9zdCgnaHR0cDovL2xvY2FsaG9zdC91cGxvYWQnKVxuICogICAuYXR0YWNoKCdmaWxlcycsICdpbWFnZS5qcGcnKVxuICogICAuZW5kKGNhbGxiYWNrKTtcbiAqIGBgYFxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWVsZFxuICogQHBhcmFtIHtTdHJpbmd8ZnMuUmVhZFN0cmVhbXxCdWZmZXJ9IGZpbGVcbiAqIEBwYXJhbSB7U3RyaW5nfE9iamVjdH0gb3B0aW9uc1xuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmF0dGFjaCA9IGZ1bmN0aW9uIChmaWVsZCwgZmlsZSwgb3B0aW9ucykge1xuICBpZiAoZmlsZSkge1xuICAgIGlmICh0aGlzLl9kYXRhKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJzdXBlcmFnZW50IGNhbid0IG1peCAuc2VuZCgpIGFuZCAuYXR0YWNoKClcIik7XG4gICAgfVxuXG4gICAgbGV0IG8gPSBvcHRpb25zIHx8IHt9O1xuICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ3N0cmluZycpIHtcbiAgICAgIG8gPSB7IGZpbGVuYW1lOiBvcHRpb25zIH07XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBmaWxlID09PSAnc3RyaW5nJykge1xuICAgICAgaWYgKCFvLmZpbGVuYW1lKSBvLmZpbGVuYW1lID0gZmlsZTtcbiAgICAgIGRlYnVnKCdjcmVhdGluZyBgZnMuUmVhZFN0cmVhbWAgaW5zdGFuY2UgZm9yIGZpbGU6ICVzJywgZmlsZSk7XG4gICAgICBmaWxlID0gZnMuY3JlYXRlUmVhZFN0cmVhbShmaWxlKTtcbiAgICAgIGZpbGUub24oJ2Vycm9yJywgKGVycm9yKSA9PiB7XG4gICAgICAgIGNvbnN0IGZvcm1EYXRhID0gdGhpcy5fZ2V0Rm9ybURhdGEoKTtcbiAgICAgICAgZm9ybURhdGEuZW1pdCgnZXJyb3InLCBlcnJvcik7XG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKCFvLmZpbGVuYW1lICYmIGZpbGUucGF0aCkge1xuICAgICAgby5maWxlbmFtZSA9IGZpbGUucGF0aDtcbiAgICB9XG5cbiAgICB0aGlzLl9nZXRGb3JtRGF0YSgpLmFwcGVuZChmaWVsZCwgZmlsZSwgbyk7XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cblJlcXVlc3QucHJvdG90eXBlLl9nZXRGb3JtRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLl9mb3JtRGF0YSkge1xuICAgIHRoaXMuX2Zvcm1EYXRhID0gbmV3IEZvcm1EYXRhKCk7XG4gICAgdGhpcy5fZm9ybURhdGEub24oJ2Vycm9yJywgKGVycm9yKSA9PiB7XG4gICAgICBkZWJ1ZygnRm9ybURhdGEgZXJyb3InLCBlcnJvcik7XG4gICAgICBpZiAodGhpcy5jYWxsZWQpIHtcbiAgICAgICAgLy8gVGhlIHJlcXVlc3QgaGFzIGFscmVhZHkgZmluaXNoZWQgYW5kIHRoZSBjYWxsYmFjayB3YXMgY2FsbGVkLlxuICAgICAgICAvLyBTaWxlbnRseSBpZ25vcmUgdGhlIGVycm9yLlxuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHRoaXMuY2FsbGJhY2soZXJyb3IpO1xuICAgICAgdGhpcy5hYm9ydCgpO1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHRoaXMuX2Zvcm1EYXRhO1xufTtcblxuLyoqXG4gKiBHZXRzL3NldHMgdGhlIGBBZ2VudGAgdG8gdXNlIGZvciB0aGlzIEhUVFAgcmVxdWVzdC4gVGhlIGRlZmF1bHQgKGlmIHRoaXNcbiAqIGZ1bmN0aW9uIGlzIG5vdCBjYWxsZWQpIGlzIHRvIG9wdCBvdXQgb2YgY29ubmVjdGlvbiBwb29saW5nIChgYWdlbnQ6IGZhbHNlYCkuXG4gKlxuICogQHBhcmFtIHtodHRwLkFnZW50fSBhZ2VudFxuICogQHJldHVybiB7aHR0cC5BZ2VudH1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuYWdlbnQgPSBmdW5jdGlvbiAoYWdlbnQpIHtcbiAgaWYgKFxuICAgIGFyZ3VtZW50cy5sZW5ndGggPiAwICYmXG4gICAgYWdlbnQgJiZcbiAgICB0eXBlb2YgYWdlbnQgPT09ICdvYmplY3QnICYmXG4gICAgdHlwZW9mIGFnZW50LmFkZFJlcXVlc3QgIT09ICdmdW5jdGlvbidcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcbiAgICAgICcuYWdlbnQoKSBleHBlY3RzIGFuIGh0dHAocykuQWdlbnQtY29tcGF0aWJsZSBvYmplY3QuIERpZCB5b3UgbWVhbiB0byB1c2UgLmNlcnQoKSBhbmQgLmtleSgpPydcbiAgICApO1xuICB9XG5cbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHJldHVybiB0aGlzLl9hZ2VudDtcbiAgdGhpcy5fYWdlbnQgPSBhZ2VudDtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIEdldHMvc2V0cyB0aGUgYGxvb2t1cGAgZnVuY3Rpb24gdG8gdXNlIGN1c3RvbSBETlMgcmVzb2x2ZXIuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gbG9va3VwXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUubG9va3VwID0gZnVuY3Rpb24gKGxvb2t1cCkge1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHRoaXMuX2xvb2t1cDtcbiAgdGhpcy5fbG9va3VwID0gbG9va3VwO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IF9Db250ZW50LVR5cGVfIHJlc3BvbnNlIGhlYWRlciBwYXNzZWQgdGhyb3VnaCBgbWltZS5nZXRUeXBlKClgLlxuICpcbiAqIEV4YW1wbGVzOlxuICpcbiAqICAgICAgcmVxdWVzdC5wb3N0KCcvJylcbiAqICAgICAgICAudHlwZSgneG1sJylcbiAqICAgICAgICAuc2VuZCh4bWxzdHJpbmcpXG4gKiAgICAgICAgLmVuZChjYWxsYmFjayk7XG4gKlxuICogICAgICByZXF1ZXN0LnBvc3QoJy8nKVxuICogICAgICAgIC50eXBlKCdqc29uJylcbiAqICAgICAgICAuc2VuZChqc29uc3RyaW5nKVxuICogICAgICAgIC5lbmQoY2FsbGJhY2spO1xuICpcbiAqICAgICAgcmVxdWVzdC5wb3N0KCcvJylcbiAqICAgICAgICAudHlwZSgnYXBwbGljYXRpb24vanNvbicpXG4gKiAgICAgICAgLnNlbmQoanNvbnN0cmluZylcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZVxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLnR5cGUgPSBmdW5jdGlvbiAodHlwZSkge1xuICByZXR1cm4gdGhpcy5zZXQoXG4gICAgJ0NvbnRlbnQtVHlwZScsXG4gICAgdHlwZS5pbmNsdWRlcygnLycpID8gdHlwZSA6IG1pbWUuZ2V0VHlwZSh0eXBlKVxuICApO1xufTtcblxuLyoqXG4gKiBTZXQgX0FjY2VwdF8gcmVzcG9uc2UgaGVhZGVyIHBhc3NlZCB0aHJvdWdoIGBtaW1lLmdldFR5cGUoKWAuXG4gKlxuICogRXhhbXBsZXM6XG4gKlxuICogICAgICBzdXBlcmFnZW50LnR5cGVzLmpzb24gPSAnYXBwbGljYXRpb24vanNvbic7XG4gKlxuICogICAgICByZXF1ZXN0LmdldCgnL2FnZW50JylcbiAqICAgICAgICAuYWNjZXB0KCdqc29uJylcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiAgICAgIHJlcXVlc3QuZ2V0KCcvYWdlbnQnKVxuICogICAgICAgIC5hY2NlcHQoJ2FwcGxpY2F0aW9uL2pzb24nKVxuICogICAgICAgIC5lbmQoY2FsbGJhY2spO1xuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBhY2NlcHRcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5hY2NlcHQgPSBmdW5jdGlvbiAodHlwZSkge1xuICByZXR1cm4gdGhpcy5zZXQoJ0FjY2VwdCcsIHR5cGUuaW5jbHVkZXMoJy8nKSA/IHR5cGUgOiBtaW1lLmdldFR5cGUodHlwZSkpO1xufTtcblxuLyoqXG4gKiBBZGQgcXVlcnktc3RyaW5nIGB2YWxgLlxuICpcbiAqIEV4YW1wbGVzOlxuICpcbiAqICAgcmVxdWVzdC5nZXQoJy9zaG9lcycpXG4gKiAgICAgLnF1ZXJ5KCdzaXplPTEwJylcbiAqICAgICAucXVlcnkoeyBjb2xvcjogJ2JsdWUnIH0pXG4gKlxuICogQHBhcmFtIHtPYmplY3R8U3RyaW5nfSB2YWxcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5xdWVyeSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHRoaXMuX3F1ZXJ5LnB1c2godmFsdWUpO1xuICB9IGVsc2Uge1xuICAgIE9iamVjdC5hc3NpZ24odGhpcy5xcywgdmFsdWUpO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFdyaXRlIHJhdyBgZGF0YWAgLyBgZW5jb2RpbmdgIHRvIHRoZSBzb2NrZXQuXG4gKlxuICogQHBhcmFtIHtCdWZmZXJ8U3RyaW5nfSBkYXRhXG4gKiBAcGFyYW0ge1N0cmluZ30gZW5jb2RpbmdcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24gKGRhdGEsIGVuY29kaW5nKSB7XG4gIGNvbnN0IHJlcXVlc3RfID0gdGhpcy5yZXF1ZXN0KCk7XG4gIGlmICghdGhpcy5fc3RyZWFtUmVxdWVzdCkge1xuICAgIHRoaXMuX3N0cmVhbVJlcXVlc3QgPSB0cnVlO1xuICAgIHRoaXMuX3N0cmVhbVJlc3BvbnNlTGlzdGVuZXIgPSAocmVzKSA9PiB7XG4gICAgICB0aGlzLl9zdHJlYW1SZXNwb25zZSA9IHJlcztcbiAgICB9O1xuICAgIHJlcXVlc3RfLm9uY2UoJ3Jlc3BvbnNlJywgdGhpcy5fc3RyZWFtUmVzcG9uc2VMaXN0ZW5lcik7XG4gIH1cblxuICByZXR1cm4gcmVxdWVzdF8ud3JpdGUoZGF0YSwgZW5jb2RpbmcpO1xufTtcblxuLyoqXG4gKiBQaXBlIHRoZSByZXF1ZXN0IGJvZHkgdG8gYHN0cmVhbWAuXG4gKlxuICogQHBhcmFtIHtTdHJlYW19IHN0cmVhbVxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm4ge1N0cmVhbX1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUucGlwZSA9IGZ1bmN0aW9uIChzdHJlYW0sIG9wdGlvbnMpIHtcbiAgdGhpcy5waXBlZCA9IHRydWU7IC8vIEhBQ0suLi5cbiAgdGhpcy5idWZmZXIoZmFsc2UpO1xuICB0aGlzLmVuZCgpO1xuICByZXR1cm4gdGhpcy5fcGlwZUNvbnRpbnVlKHN0cmVhbSwgb3B0aW9ucyk7XG59O1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5fcGlwZUNvbnRpbnVlID0gZnVuY3Rpb24gKHN0cmVhbSwgb3B0aW9ucykge1xuICB0aGlzLnJlcS5vbmNlKCdyZXNwb25zZScsIChyZXMpID0+IHtcbiAgICAvLyByZWRpcmVjdFxuICAgIGlmIChcbiAgICAgIGlzUmVkaXJlY3QocmVzLnN0YXR1c0NvZGUpICYmXG4gICAgICB0aGlzLl9yZWRpcmVjdHMrKyAhPT0gdGhpcy5fbWF4UmVkaXJlY3RzXG4gICAgKSB7XG4gICAgICByZXR1cm4gdGhpcy5fcmVkaXJlY3QocmVzKSA9PT0gdGhpc1xuICAgICAgICA/IHRoaXMuX3BpcGVDb250aW51ZShzdHJlYW0sIG9wdGlvbnMpXG4gICAgICAgIDogdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIHRoaXMucmVzID0gcmVzO1xuICAgIHRoaXMuX2VtaXRSZXNwb25zZSgpO1xuICAgIGlmICh0aGlzLl9hYm9ydGVkKSByZXR1cm47XG5cbiAgICBpZiAodGhpcy5fc2hvdWxkRGVjb21wcmVzcyhyZXMpKSB7XG4gICAgICBjb25zdCBkZWNvbXByZXNzZXIgPSBjaG9vc2VEZWNvbXByZXNzZXIocmVzKTtcblxuICAgICAgZGVjb21wcmVzc2VyLm9uKCdlcnJvcicsIChlcnJvcikgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gJ1pfQlVGX0VSUk9SJykge1xuICAgICAgICAgIC8vIHVuZXhwZWN0ZWQgZW5kIG9mIGZpbGUgaXMgaWdub3JlZCBieSBicm93c2VycyBhbmQgY3VybFxuICAgICAgICAgIHN0cmVhbS5lbWl0KCdlbmQnKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBzdHJlYW0uZW1pdCgnZXJyb3InLCBlcnJvcik7XG4gICAgICB9KTtcbiAgICAgIHJlcy5waXBlKGRlY29tcHJlc3NlcikucGlwZShzdHJlYW0sIG9wdGlvbnMpO1xuICAgICAgLy8gZG9uJ3QgZW1pdCAnZW5kJyB1bnRpbCBkZWNvbXByZXNzZXIgaGFzIGNvbXBsZXRlZCB3cml0aW5nIGFsbCBpdHMgZGF0YS5cbiAgICAgIGRlY29tcHJlc3Nlci5vbmNlKCdlbmQnLCAoKSA9PiB0aGlzLmVtaXQoJ2VuZCcpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzLnBpcGUoc3RyZWFtLCBvcHRpb25zKTtcbiAgICAgIHJlcy5vbmNlKCdlbmQnLCAoKSA9PiB0aGlzLmVtaXQoJ2VuZCcpKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gc3RyZWFtO1xufTtcblxuLyoqXG4gKiBFbmFibGUgLyBkaXNhYmxlIGJ1ZmZlcmluZy5cbiAqXG4gKiBAcmV0dXJuIHtCb29sZWFufSBbdmFsXVxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmJ1ZmZlciA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICB0aGlzLl9idWZmZXIgPSB2YWx1ZSAhPT0gZmFsc2U7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSZWRpcmVjdCB0byBgdXJsXG4gKlxuICogQHBhcmFtIHtJbmNvbWluZ01lc3NhZ2V9IHJlc1xuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5fcmVkaXJlY3QgPSBmdW5jdGlvbiAocmVzKSB7XG4gIGxldCB1cmwgPSByZXMuaGVhZGVycy5sb2NhdGlvbjtcbiAgaWYgKCF1cmwpIHtcbiAgICByZXR1cm4gdGhpcy5jYWxsYmFjayhuZXcgRXJyb3IoJ05vIGxvY2F0aW9uIGhlYWRlciBmb3IgcmVkaXJlY3QnKSwgcmVzKTtcbiAgfVxuXG4gIGRlYnVnKCdyZWRpcmVjdCAlcyAtPiAlcycsIHRoaXMudXJsLCB1cmwpO1xuXG4gIC8vIGVuc3VyZSB0aGUgcmVzcG9uc2UgaXMgYmVpbmcgY29uc3VtZWRcbiAgLy8gdGhpcyBpcyByZXF1aXJlZCBmb3IgTm9kZSB2MC4xMCtcbiAgcmVzLnJlc3VtZSgpO1xuXG4gIC8vIGxvY2F0aW9uXG4gIC8vXG4gIC8vIFRoZSBMb2NhdGlvbiBoZWFkZXIgaXMgYXR0YWNrZXIgY29udHJvbGxlZDogYSBtYWxmb3JtZWQgdmFsdWUgbXVzdCBub3RcbiAgLy8gdGhyb3cgb3V0IG9mIHRoZSByZXNwb25zZSBldmVudCAod2hpY2ggd291bGQgY3Jhc2ggdGhlIHByb2Nlc3MpLCBhbmQgb25seVxuICAvLyBodHRwKHMpIHRhcmdldHMgbWF5IGJlIGZvbGxvd2VkLiBBIHJlbW90ZSBzZXJ2ZXIgbXVzdCBuZXZlciBiZSBhYmxlIHRvXG4gIC8vIHN0ZWVyIHRoZSBjbGllbnQgaW50byBhIGxvY2FsIFVuaXggZG9tYWluIHNvY2tldCBvciBhbm90aGVyIHNjaGVtZS5cbiAgbGV0IHRhcmdldDtcbiAgbGV0IGN1cnJlbnQ7XG4gIHRyeSB7XG4gICAgY3VycmVudCA9IG5ldyBVUkwod2l0aERlZmF1bHRQcm90b2NvbCh0aGlzLnVybCkpO1xuICAgIHRhcmdldCA9IG5ldyBVUkwodXJsLCBjdXJyZW50KTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoYEludmFsaWQgcmVkaXJlY3QgbG9jYXRpb246ICR7dXJsfWApO1xuICAgIGVycm9yLmNvZGUgPSAnRUlOVkFMSURSRURJUkVDVCc7XG4gICAgZXJyb3Iuc3RhdHVzID0gcmVzLnN0YXR1c0NvZGU7XG4gICAgZXJyb3IubG9jYXRpb24gPSB1cmw7XG4gICAgcmV0dXJuIHRoaXMuY2FsbGJhY2soZXJyb3IsIHJlcyk7XG4gIH1cblxuICBpZiAoIWlzQWxsb3dlZFJlZGlyZWN0VGFyZ2V0KGN1cnJlbnQsIHRhcmdldCkpIHtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcihcbiAgICAgIGBVbnN1cHBvcnRlZCBwcm90b2NvbCBpbiByZWRpcmVjdCBsb2NhdGlvbjogJHt0YXJnZXQuaHJlZn1gXG4gICAgKTtcbiAgICBlcnJvci5jb2RlID0gJ0VVTlNVUFBPUlRFRFJFRElSRUNUJztcbiAgICBlcnJvci5zdGF0dXMgPSByZXMuc3RhdHVzQ29kZTtcbiAgICBlcnJvci5sb2NhdGlvbiA9IHVybDtcbiAgICByZXR1cm4gdGhpcy5jYWxsYmFjayhlcnJvciwgcmVzKTtcbiAgfVxuXG4gIHVybCA9IHRhcmdldC5ocmVmO1xuXG4gIHRoaXMuX2VtaXRQcmVSZWRpcmVjdChyZXMpO1xuXG4gIGxldCBoZWFkZXJzID0gdGhpcy5yZXEuZ2V0SGVhZGVycyA/IHRoaXMucmVxLmdldEhlYWRlcnMoKSA6IHRoaXMucmVxLl9oZWFkZXJzO1xuXG4gIGNvbnN0IGNoYW5nZXNPcmlnaW4gPSAhaXNTYW1lT3JpZ2luKGN1cnJlbnQsIHRhcmdldCk7XG5cbiAgLy8gaW1wbGVtZW50YXRpb24gb2YgMzAyIGZvbGxvd2luZyBkZWZhY3RvIHN0YW5kYXJkXG4gIGlmIChyZXMuc3RhdHVzQ29kZSA9PT0gMzAxIHx8IHJlcy5zdGF0dXNDb2RlID09PSAzMDIpIHtcbiAgICAvLyBzdHJpcCBDb250ZW50LSogcmVsYXRlZCBmaWVsZHNcbiAgICAvLyBpbiBjYXNlIG9mIFBPU1QgZXRjXG4gICAgaGVhZGVycyA9IHV0aWxzLmNsZWFuSGVhZGVyKGhlYWRlcnMsIGNoYW5nZXNPcmlnaW4pO1xuXG4gICAgLy8gZm9yY2UgR0VUXG4gICAgdGhpcy5tZXRob2QgPSB0aGlzLm1ldGhvZCA9PT0gJ0hFQUQnID8gJ0hFQUQnIDogJ0dFVCc7XG5cbiAgICAvLyBjbGVhciBkYXRhXG4gICAgdGhpcy5fZGF0YSA9IG51bGw7XG4gIH1cblxuICAvLyAzMDMgaXMgYWx3YXlzIEdFVFxuICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDMwMykge1xuICAgIC8vIHN0cmlwIENvbnRlbnQtKiByZWxhdGVkIGZpZWxkc1xuICAgIC8vIGluIGNhc2Ugb2YgUE9TVCBldGNcbiAgICBoZWFkZXJzID0gdXRpbHMuY2xlYW5IZWFkZXIoaGVhZGVycywgY2hhbmdlc09yaWdpbik7XG5cbiAgICAvLyBmb3JjZSBtZXRob2RcbiAgICB0aGlzLm1ldGhvZCA9ICdHRVQnO1xuXG4gICAgLy8gY2xlYXIgZGF0YVxuICAgIHRoaXMuX2RhdGEgPSBudWxsO1xuICB9XG5cbiAgLy8gMzA3IHByZXNlcnZlcyBtZXRob2RcbiAgLy8gMzA4IHByZXNlcnZlcyBtZXRob2RcbiAgaWYgKChyZXMuc3RhdHVzQ29kZSA9PT0gMzA3IHx8IHJlcy5zdGF0dXNDb2RlID09PSAzMDgpICYmIGNoYW5nZXNPcmlnaW4pIHtcbiAgICBkZWxldGUgaGVhZGVycy5hdXRob3JpemF0aW9uO1xuICAgIGRlbGV0ZSBoZWFkZXJzLmNvb2tpZTtcbiAgfVxuXG4gIC8vIGNyZWRlbnRpYWxzIGdpdmVuIHdpdGggYC5hdXRoKHVzZXIsIHBhc3MsIHsgdHlwZTogJ2F1dG8nIH0pYCBhcmUgdHVybmVkXG4gIC8vIGludG8gYW4gQXV0aG9yaXphdGlvbiBoZWFkZXIgYnkgZXZlcnkgYHJlcXVlc3QoKWAgY2FsbCwgc28gdGhleSBtdXN0IGJlXG4gIC8vIGRyb3BwZWQgYXMgd2VsbCBvciB0aGV5IHdvdWxkIGJlIHJlLXNlbnQgdG8gdGhlIG5ldyBvcmlnaW5cbiAgaWYgKGNoYW5nZXNPcmlnaW4pIHtcbiAgICB0aGlzLnVzZXJuYW1lID0gdW5kZWZpbmVkO1xuICAgIHRoaXMucGFzc3dvcmQgPSB1bmRlZmluZWQ7XG4gIH1cblxuICBkZWxldGUgaGVhZGVycy5ob3N0O1xuXG4gIGRlbGV0ZSB0aGlzLnJlcTtcbiAgZGVsZXRlIHRoaXMuX2Zvcm1EYXRhO1xuXG4gIC8vIHJlbW92ZSBhbGwgYWRkIGhlYWRlciBleGNlcHQgVXNlci1BZ2VudFxuICBfaW5pdEhlYWRlcnModGhpcyk7XG5cbiAgLy8gcmVkaXJlY3RcbiAgdGhpcy5yZXMgPSByZXM7XG4gIHRoaXMuX2VuZENhbGxlZCA9IGZhbHNlO1xuICB0aGlzLnVybCA9IHVybDtcbiAgdGhpcy5xcyA9IHt9O1xuICB0aGlzLl9xdWVyeS5sZW5ndGggPSAwO1xuICB0aGlzLnNldChoZWFkZXJzKTtcbiAgdGhpcy5fZW1pdFJlZGlyZWN0KCk7XG4gIHRoaXMuX3JlZGlyZWN0TGlzdC5wdXNoKHRoaXMudXJsKTtcbiAgdGhpcy5lbmQodGhpcy5fY2FsbGJhY2spO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IEF1dGhvcml6YXRpb24gZmllbGQgdmFsdWUgd2l0aCBgdXNlcmAgYW5kIGBwYXNzYC5cbiAqXG4gKiBFeGFtcGxlczpcbiAqXG4gKiAgIC5hdXRoKCd0b2JpJywgJ2xlYXJuYm9vc3QnKVxuICogICAuYXV0aCgndG9iaTpsZWFybmJvb3N0JylcbiAqICAgLmF1dGgoJ3RvYmknKVxuICogICAuYXV0aChhY2Nlc3NUb2tlbiwgeyB0eXBlOiAnYmVhcmVyJyB9KVxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1c2VyXG4gKiBAcGFyYW0ge1N0cmluZ30gW3Bhc3NdXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIG9wdGlvbnMgd2l0aCBhdXRob3JpemF0aW9uIHR5cGUgJ2Jhc2ljJyBvciAnYmVhcmVyJyAoJ2Jhc2ljJyBpcyBkZWZhdWx0KVxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmF1dGggPSBmdW5jdGlvbiAodXNlciwgcGFzcywgb3B0aW9ucykge1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkgcGFzcyA9ICcnO1xuICBpZiAodHlwZW9mIHBhc3MgPT09ICdvYmplY3QnICYmIHBhc3MgIT09IG51bGwpIHtcbiAgICAvLyBwYXNzIGlzIG9wdGlvbmFsIGFuZCBjYW4gYmUgcmVwbGFjZWQgd2l0aCBvcHRpb25zXG4gICAgb3B0aW9ucyA9IHBhc3M7XG4gICAgcGFzcyA9ICcnO1xuICB9XG5cbiAgaWYgKCFvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IHsgdHlwZTogJ2Jhc2ljJyB9O1xuICB9XG5cbiAgY29uc3QgZW5jb2RlciA9IChzdHJpbmcpID0+IEJ1ZmZlci5mcm9tKHN0cmluZykudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuXG4gIHJldHVybiB0aGlzLl9hdXRoKHVzZXIsIHBhc3MsIG9wdGlvbnMsIGVuY29kZXIpO1xufTtcblxuLyoqXG4gKiBTZXQgdGhlIGNlcnRpZmljYXRlIGF1dGhvcml0eSBvcHRpb24gZm9yIGh0dHBzIHJlcXVlc3QuXG4gKlxuICogQHBhcmFtIHtCdWZmZXIgfCBBcnJheX0gY2VydFxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmNhID0gZnVuY3Rpb24gKGNlcnQpIHtcbiAgdGhpcy5fY2EgPSBjZXJ0O1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IHRoZSBjbGllbnQgY2VydGlmaWNhdGUga2V5IG9wdGlvbiBmb3IgaHR0cHMgcmVxdWVzdC5cbiAqXG4gKiBAcGFyYW0ge0J1ZmZlciB8IFN0cmluZ30gY2VydFxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmtleSA9IGZ1bmN0aW9uIChjZXJ0KSB7XG4gIHRoaXMuX2tleSA9IGNlcnQ7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgdGhlIGtleSwgY2VydGlmaWNhdGUsIGFuZCBDQSBjZXJ0cyBvZiB0aGUgY2xpZW50IGluIFBGWCBvciBQS0NTMTIgZm9ybWF0LlxuICpcbiAqIEBwYXJhbSB7QnVmZmVyIHwgU3RyaW5nfSBjZXJ0XG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUucGZ4ID0gZnVuY3Rpb24gKGNlcnQpIHtcbiAgaWYgKHR5cGVvZiBjZXJ0ID09PSAnb2JqZWN0JyAmJiAhQnVmZmVyLmlzQnVmZmVyKGNlcnQpKSB7XG4gICAgdGhpcy5fcGZ4ID0gY2VydC5wZng7XG4gICAgdGhpcy5fcGFzc3BocmFzZSA9IGNlcnQucGFzc3BocmFzZTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLl9wZnggPSBjZXJ0O1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCB0aGUgY2xpZW50IGNlcnRpZmljYXRlIG9wdGlvbiBmb3IgaHR0cHMgcmVxdWVzdC5cbiAqXG4gKiBAcGFyYW0ge0J1ZmZlciB8IFN0cmluZ30gY2VydFxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmNlcnQgPSBmdW5jdGlvbiAoY2VydCkge1xuICB0aGlzLl9jZXJ0ID0gY2VydDtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIERvIG5vdCByZWplY3QgZXhwaXJlZCBvciBpbnZhbGlkIFRMUyBjZXJ0cy5cbiAqIHNldHMgYHJlamVjdFVuYXV0aG9yaXplZD10cnVlYC4gQmUgd2FybmVkIHRoYXQgdGhpcyBhbGxvd3MgTUlUTSBhdHRhY2tzLlxuICpcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5kaXNhYmxlVExTQ2VydHMgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuX2Rpc2FibGVUTFNDZXJ0cyA9IHRydWU7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSZXR1cm4gYW4gaHR0cFtzXSByZXF1ZXN0LlxuICpcbiAqIEByZXR1cm4ge091dGdvaW5nTWVzc2FnZX1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBjb21wbGV4aXR5XG5SZXF1ZXN0LnByb3RvdHlwZS5yZXF1ZXN0ID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXEpIHJldHVybiB0aGlzLnJlcTtcblxuICBjb25zdCBvcHRpb25zID0ge307XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBxdWVyeSA9IHFzLnN0cmluZ2lmeSh0aGlzLnFzLCB7XG4gICAgICBpbmRpY2VzOiBmYWxzZSxcbiAgICAgIHN0cmljdE51bGxIYW5kbGluZzogdHJ1ZVxuICAgIH0pO1xuICAgIGlmIChxdWVyeSkge1xuICAgICAgdGhpcy5xcyA9IHt9O1xuICAgICAgdGhpcy5fcXVlcnkucHVzaChxdWVyeSk7XG4gICAgfVxuXG4gICAgdGhpcy5fZmluYWxpemVRdWVyeVN0cmluZygpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gdGhpcy5lbWl0KCdlcnJvcicsIGVycik7XG4gIH1cblxuICBjb25zdCB1cmxTdHJpbmcgPSB3aXRoRGVmYXVsdFByb3RvY29sKHRoaXMudXJsKTtcbiAgY29uc3QgcmV0cmllcyA9IHRoaXMuX3JldHJpZXM7XG5cbiAgY29uc3QgcHJvdGVjdGVkVXJsID0gcHJlc2VydmVEb3RTZWdtZW50cyh1cmxTdHJpbmcpO1xuICBjb25zdCB1cmwgPSBuZXcgVVJMKHByb3RlY3RlZFVybC51cmxTdHJpbmcpO1xuICBsZXQgeyBwcm90b2NvbCB9ID0gdXJsO1xuICBjb25zdCBwYXRoID0gcHJvdGVjdGVkVXJsLnJlc3RvcmVQYXRoKGAke3VybC5wYXRobmFtZX0ke3VybC5zZWFyY2h9YCk7XG5cbiAgLy8gc3VwcG9ydCB1bml4IHNvY2tldHNcbiAgaWYgKC9eaHR0cHM/XFwrdW5peDovLnRlc3QocHJvdG9jb2wpID09PSB0cnVlKSB7XG4gICAgLy8gZ2V0IHRoZSBwcm90b2NvbFxuICAgIHByb3RvY29sID0gYCR7cHJvdG9jb2wuc3BsaXQoJysnKVswXX06YDtcblxuICAgIGlmICghdXJsLmhvc3RuYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICdJbnZhbGlkIHVuaXggc29ja2V0IFVSTDogcGVyY2VudC1lbmNvZGUgdGhlIHNvY2tldCBwYXRoIGJ5IHJlcGxhY2luZyBcIi9cIiB3aXRoIFwiJTJGXCIuJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBnZXQgdGhlIHNvY2tldCBwYXRoXG4gICAgb3B0aW9ucy5zb2NrZXRQYXRoID0gdXJsLmhvc3RuYW1lLnJlcGxhY2UoLyUyRi9nLCAnLycpO1xuICAgIHVybC5ob3N0ID0gJyc7XG4gICAgdXJsLmhvc3RuYW1lID0gJyc7XG4gIH1cblxuICAvLyBPdmVycmlkZSBJUCBhZGRyZXNzIG9mIGEgaG9zdG5hbWVcbiAgaWYgKHRoaXMuX2Nvbm5lY3RPdmVycmlkZSkge1xuICAgIGNvbnN0IHsgaG9zdG5hbWUgfSA9IHVybDtcbiAgICAvLyB0aGUgaG9zdG5hbWUgbWF5IGNvbWUgZnJvbSBhIHJlZGlyZWN0LCBzbyBuZXZlciBsZXQgYW4gaW5oZXJpdGVkIGtleVxuICAgIC8vIHN1Y2ggYXMgXCJjb25zdHJ1Y3RvclwiIGFjdCBhcyBhbiBvdmVycmlkZSBlbnRyeVxuICAgIGNvbnN0IG1hdGNoID0gaGFzT3duKHRoaXMuX2Nvbm5lY3RPdmVycmlkZSwgaG9zdG5hbWUpXG4gICAgICA/IHRoaXMuX2Nvbm5lY3RPdmVycmlkZVtob3N0bmFtZV1cbiAgICAgIDogdGhpcy5fY29ubmVjdE92ZXJyaWRlWycqJ107XG4gICAgaWYgKG1hdGNoKSB7XG4gICAgICAvLyBiYWNrdXAgdGhlIHJlYWwgaG9zdFxuICAgICAgaWYgKCF0aGlzLl9oZWFkZXIuaG9zdCkge1xuICAgICAgICB0aGlzLnNldCgnaG9zdCcsIHVybC5ob3N0KTtcbiAgICAgIH1cblxuICAgICAgbGV0IG5ld0hvc3Q7XG4gICAgICBsZXQgbmV3UG9ydDtcblxuICAgICAgaWYgKHR5cGVvZiBtYXRjaCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgbmV3SG9zdCA9IG1hdGNoLmhvc3Q7XG4gICAgICAgIG5ld1BvcnQgPSBtYXRjaC5wb3J0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbmV3SG9zdCA9IG1hdGNoO1xuICAgICAgICBuZXdQb3J0ID0gdXJsLnBvcnQ7XG4gICAgICB9XG5cbiAgICAgIC8vIHdyYXAgW2lwdjZdXG4gICAgICB1cmwuaG9zdCA9IC86Ly50ZXN0KG5ld0hvc3QpID8gYFske25ld0hvc3R9XWAgOiBuZXdIb3N0O1xuICAgICAgaWYgKG5ld1BvcnQpIHtcbiAgICAgICAgdXJsLmhvc3QgKz0gYDoke25ld1BvcnR9YDtcbiAgICAgICAgdXJsLnBvcnQgPSBuZXdQb3J0O1xuICAgICAgfVxuXG4gICAgICB1cmwuaG9zdG5hbWUgPSBuZXdIb3N0O1xuICAgIH1cbiAgfVxuXG4gIC8vIG9wdGlvbnNcbiAgb3B0aW9ucy5tZXRob2QgPSB0aGlzLm1ldGhvZDtcbiAgb3B0aW9ucy5wb3J0ID0gdXJsLnBvcnQ7XG4gIG9wdGlvbnMucGF0aCA9IHBhdGg7XG4gIG9wdGlvbnMuaG9zdCA9IHV0aWxzLm5vcm1hbGl6ZUhvc3RuYW1lKHVybC5ob3N0bmFtZSk7IC8vIGV4OiBbOjoxXSAtPiA6OjFcbiAgLy8gQXBwbHkgdXNlciBoZWFkZXJzIGJlZm9yZSBjb25uZWN0aW5nIHNvIGludmFsaWQgdmFsdWVzIChlLmcuIHVuZGVmaW5lZClcbiAgLy8gdGhyb3cgd2l0aG91dCBhbGxvY2F0aW5nIGEgVENQIGhhbmRsZS4gU2VlICMxODI3LlxuICAvLyBIVFRQLzIncyB3cmFwcGVyIGZvcndhcmRzIGxlZnRvdmVyIG9wdGlvbnMgdG8gaHR0cDIuY29ubmVjdCgpLCBzbyBvbmx5XG4gIC8vIGRvIHRoaXMgb24gSFRUUC8xLlxuICBpZiAoIXRoaXMuX2VuYWJsZUh0dHAyKSB7XG4gICAgb3B0aW9ucy5oZWFkZXJzID0geyAuLi50aGlzLmhlYWRlciB9O1xuICB9XG5cbiAgb3B0aW9ucy5jYSA9IHRoaXMuX2NhO1xuICBvcHRpb25zLmtleSA9IHRoaXMuX2tleTtcbiAgb3B0aW9ucy5wZnggPSB0aGlzLl9wZng7XG4gIG9wdGlvbnMuY2VydCA9IHRoaXMuX2NlcnQ7XG4gIG9wdGlvbnMucGFzc3BocmFzZSA9IHRoaXMuX3Bhc3NwaHJhc2U7XG4gIG9wdGlvbnMuYWdlbnQgPSB0aGlzLl9hZ2VudDtcbiAgb3B0aW9ucy5sb29rdXAgPSB0aGlzLl9sb29rdXA7XG4gIG9wdGlvbnMucmVqZWN0VW5hdXRob3JpemVkID1cbiAgICB0eXBlb2YgdGhpcy5fZGlzYWJsZVRMU0NlcnRzID09PSAnYm9vbGVhbidcbiAgICAgID8gIXRoaXMuX2Rpc2FibGVUTFNDZXJ0c1xuICAgICAgOiBwcm9jZXNzLmVudi5OT0RFX1RMU19SRUpFQ1RfVU5BVVRIT1JJWkVEICE9PSAnMCc7XG5cbiAgLy8gQWxsb3dzIHJlcXVlc3QuZ2V0KCdodHRwczovLzEuMi4zLjQvJykuc2V0KCdIb3N0JywgJ2V4YW1wbGUuY29tJylcbiAgaWYgKHRoaXMuX2hlYWRlci5ob3N0KSB7XG4gICAgb3B0aW9ucy5zZXJ2ZXJuYW1lID0gdGhpcy5faGVhZGVyLmhvc3QucmVwbGFjZSgvOlxcZCskLywgJycpO1xuICB9XG5cbiAgaWYgKFxuICAgIHRoaXMuX3RydXN0TG9jYWxob3N0ICYmXG4gICAgL14oPzpsb2NhbGhvc3R8MTI3XFwuMFxcLjBcXC5cXGQrfCgwKjopKzowKjEpJC8udGVzdCh1cmwuaG9zdG5hbWUpXG4gICkge1xuICAgIG9wdGlvbnMucmVqZWN0VW5hdXRob3JpemVkID0gZmFsc2U7XG4gIH1cblxuICAvLyBpbml0aWF0ZSByZXF1ZXN0XG4gIGNvbnN0IG1vZHVsZV8gPSB0aGlzLl9lbmFibGVIdHRwMlxuICAgID8gZXhwb3J0cy5wcm90b2NvbHNbJ2h0dHAyOiddLnNldFByb3RvY29sKHByb3RvY29sKVxuICAgIDogZXhwb3J0cy5wcm90b2NvbHNbcHJvdG9jb2xdO1xuXG4gIC8vIHJlcXVlc3RcbiAgdGhpcy5yZXEgPSBtb2R1bGVfLnJlcXVlc3Qob3B0aW9ucyk7XG4gIGNvbnN0IHsgcmVxIH0gPSB0aGlzO1xuXG4gIC8vIEF0dGFjaCB0aGlzIGJlZm9yZSBoZWFkZXIgc2V0dXAgc28gZGVzdHJveSgpIGR1cmluZyBhIHNldHVwIGV4Y2VwdGlvblxuICAvLyBjYW5ub3QgZW1pdCBhbiB1bmhhbmRsZWQgJ2Vycm9yJyAob3IgYSBzZWNvbmQgY2FsbGJhY2spLlxuICByZXEub24oJ2Vycm9yJywgKGVycm9yKSA9PiB7XG4gICAgLy8gZmxhZyBhYm9ydGlvbiBoZXJlIGZvciBvdXQgdGltZW91dHNcbiAgICAvLyBiZWNhdXNlIG5vZGUgd2lsbCBlbWl0IGEgZmF1eC1lcnJvciBcInNvY2tldCBoYW5nIHVwXCJcbiAgICAvLyB3aGVuIHJlcXVlc3QgaXMgYWJvcnRlZCBiZWZvcmUgYSBjb25uZWN0aW9uIGlzIG1hZGVcbiAgICBpZiAodGhpcy5fYWJvcnRlZCB8fCB0aGlzLl9yZXF1ZXN0RGlzcG9zZWQpIHJldHVybjtcbiAgICAvLyBpZiBub3QgdGhlIHNhbWUsIHdlIGFyZSBpbiB0aGUgKipvbGQqKiAoY2FuY2VsbGVkKSByZXF1ZXN0LFxuICAgIC8vIHNvIG5lZWQgdG8gY29udGludWUgKHNhbWUgYXMgZm9yIGFib3ZlKVxuICAgIGlmICh0aGlzLl9yZXRyaWVzICE9PSByZXRyaWVzKSByZXR1cm47XG4gICAgLy8gaWYgd2UndmUgcmVjZWl2ZWQgYSByZXNwb25zZSB0aGVuIHdlIGRvbid0IHdhbnQgdG8gbGV0XG4gICAgLy8gYW4gZXJyb3IgaW4gdGhlIHJlcXVlc3QgYmxvdyB1cCB0aGUgcmVzcG9uc2VcbiAgICBpZiAodGhpcy5yZXNwb25zZSkgcmV0dXJuO1xuICAgIHRoaXMuY2FsbGJhY2soZXJyb3IpO1xuICB9KTtcblxuICB0cnkge1xuICAgIC8vIHNldCB0Y3Agbm8gZGVsYXlcbiAgICByZXEuc2V0Tm9EZWxheSh0cnVlKTtcblxuICAgIGlmIChvcHRpb25zLm1ldGhvZCAhPT0gJ0hFQUQnKSB7XG4gICAgICByZXEuc2V0SGVhZGVyKCdBY2NlcHQtRW5jb2RpbmcnLCAnZ3ppcCwgZGVmbGF0ZScpO1xuICAgIH1cblxuICAgIHRoaXMucHJvdG9jb2wgPSBwcm90b2NvbDtcbiAgICB0aGlzLmhvc3QgPSB1cmwuaG9zdDtcblxuICAgIC8vIGV4cG9zZSBldmVudHNcbiAgICBjb25zdCBlbWl0RHJhaW4gPSAoKSA9PiB7XG4gICAgICB0aGlzLmVtaXQoJ2RyYWluJyk7XG4gICAgfTtcblxuICAgIHJlcS5vbignZHJhaW4nLCBlbWl0RHJhaW4pO1xuICAgIHJlcS5vbmNlKCdjbG9zZScsICgpID0+IHtcbiAgICAgIHJlcS5yZW1vdmVMaXN0ZW5lcignZHJhaW4nLCBlbWl0RHJhaW4pO1xuICAgIH0pO1xuXG4gICAgLy8gYXV0aFxuICAgIGlmICh1cmwudXNlcm5hbWUgfHwgdXJsLnBhc3N3b3JkKSB7XG4gICAgICB0aGlzLmF1dGgodXJsLnVzZXJuYW1lLCB1cmwucGFzc3dvcmQpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnVzZXJuYW1lICYmIHRoaXMucGFzc3dvcmQpIHtcbiAgICAgIHRoaXMuYXV0aCh0aGlzLnVzZXJuYW1lLCB0aGlzLnBhc3N3b3JkKTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLmhlYWRlcikge1xuICAgICAgaWYgKGhhc093bih0aGlzLmhlYWRlciwga2V5KSkgcmVxLnNldEhlYWRlcihrZXksIHRoaXMuaGVhZGVyW2tleV0pO1xuICAgIH1cblxuICAgIC8vIGFkZCBjb29raWVzXG4gICAgaWYgKHRoaXMuY29va2llcykge1xuICAgICAgaWYgKGhhc093bih0aGlzLl9oZWFkZXIsICdjb29raWUnKSkge1xuICAgICAgICAvLyBtZXJnZVxuICAgICAgICBjb25zdCB0ZW1wb3JhcnlKYXIgPSBuZXcgQ29va2llSmFyLkNvb2tpZUphcigpO1xuICAgICAgICB0ZW1wb3JhcnlKYXIuc2V0Q29va2llcyh0aGlzLl9oZWFkZXIuY29va2llLnNwbGl0KCc7ICcpKTtcbiAgICAgICAgdGVtcG9yYXJ5SmFyLnNldENvb2tpZXModGhpcy5jb29raWVzLnNwbGl0KCc7ICcpKTtcbiAgICAgICAgcmVxLnNldEhlYWRlcihcbiAgICAgICAgICAnQ29va2llJyxcbiAgICAgICAgICB0ZW1wb3JhcnlKYXJcbiAgICAgICAgICAgIC5nZXRDb29raWVzKENvb2tpZUphci5Db29raWVBY2Nlc3NJbmZvLkFsbClcbiAgICAgICAgICAgIC50b1ZhbHVlU3RyaW5nKClcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlcS5zZXRIZWFkZXIoJ0Nvb2tpZScsIHRoaXMuY29va2llcyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlcTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgZGlzcG9zZU5vZGVSZXF1ZXN0KHRoaXMpO1xuICAgIHRocm93IGVycjtcbiAgfVxufTtcblxuLyoqXG4gKiBBYm9ydC9lbmQgdGhlIE5vZGUgcmVxdWVzdCBpZiBpdCB3YXMgY3JlYXRlZC5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuUmVxdWVzdC5wcm90b3R5cGUuX2Rpc3Bvc2VSZXF1ZXN0ID0gZnVuY3Rpb24gKCkge1xuICBkaXNwb3NlTm9kZVJlcXVlc3QodGhpcyk7XG59O1xuXG4vKipcbiAqIFJlcG9ydCBhIHNldHVwL3JlcXVlc3QtcGF0aCBlcnJvciB3aXRob3V0IGxlYXZpbmcgdGhlIHNvY2tldCBvcGVuLlxuICpcbiAqIEBwYXJhbSB7RXJyb3J9IGVycm9yXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuUmVxdWVzdC5wcm90b3R5cGUuX2ZhaWxSZXF1ZXN0ID0gZnVuY3Rpb24gKGVycm9yKSB7XG4gIHRoaXMuX2Rpc3Bvc2VSZXF1ZXN0KCk7XG4gIGlmICh0eXBlb2YgdGhpcy5fY2FsbGJhY2sgPT09ICdmdW5jdGlvbicgJiYgdGhpcy5fY2FsbGJhY2sgIT09IG5vb3ApIHtcbiAgICB0aGlzLmNhbGxiYWNrKGVycm9yKTtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aHJvdyBlcnJvcjtcbn07XG5cbi8qKlxuICogSW52b2tlIHRoZSBjYWxsYmFjayB3aXRoIGBlcnJgIGFuZCBgcmVzYFxuICogYW5kIGhhbmRsZSBhcml0eSBjaGVjay5cbiAqXG4gKiBAcGFyYW0ge0Vycm9yfSBlcnJcbiAqIEBwYXJhbSB7UmVzcG9uc2V9IHJlc1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuY2FsbGJhY2sgPSBmdW5jdGlvbiAoZXJyb3IsIHJlcykge1xuICBpZiAodGhpcy5fc2hvdWxkUmV0cnkoZXJyb3IsIHJlcykpIHtcbiAgICByZXR1cm4gdGhpcy5fcmV0cnkoKTtcbiAgfVxuXG4gIC8vIEF2b2lkIHRoZSBlcnJvciB3aGljaCBpcyBlbWl0dGVkIGZyb20gJ3NvY2tldCBoYW5nIHVwJyB0byBjYXVzZSB0aGUgZm4gdW5kZWZpbmVkIGVycm9yIG9uIEpTIHJ1bnRpbWUuXG4gIGNvbnN0IGZuID0gdGhpcy5fY2FsbGJhY2sgfHwgbm9vcDtcbiAgdGhpcy5jbGVhclRpbWVvdXQoKTtcbiAgaWYgKHRoaXMuY2FsbGVkKSB7XG4gICAgaWYgKHRoaXMudGltZWRvdXQpIHJldHVybjtcbiAgICByZXR1cm4gY29uc29sZS53YXJuKCdzdXBlcmFnZW50OiBkb3VibGUgY2FsbGJhY2sgYnVnJyk7XG4gIH1cblxuICB0aGlzLmNhbGxlZCA9IHRydWU7XG5cbiAgaWYgKCFlcnJvcikge1xuICAgIHRyeSB7XG4gICAgICBpZiAoIXRoaXMuX2lzUmVzcG9uc2VPSyhyZXMpKSB7XG4gICAgICAgIGxldCBtZXNzYWdlID0gJ1Vuc3VjY2Vzc2Z1bCBIVFRQIHJlc3BvbnNlJztcbiAgICAgICAgaWYgKHJlcykge1xuICAgICAgICAgIG1lc3NhZ2UgPSBodHRwLlNUQVRVU19DT0RFU1tyZXMuc3RhdHVzXSB8fCBtZXNzYWdlO1xuICAgICAgICB9XG5cbiAgICAgICAgZXJyb3IgPSBuZXcgRXJyb3IobWVzc2FnZSk7XG4gICAgICAgIGVycm9yLnN0YXR1cyA9IHJlcyA/IHJlcy5zdGF0dXMgOiB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBlcnJvciA9IGVycjtcbiAgICAgIGVycm9yLnN0YXR1cyA9IGVycm9yLnN0YXR1cyB8fCAocmVzID8gcmVzLnN0YXR1cyA6IHVuZGVmaW5lZCk7XG4gICAgfVxuICB9XG5cbiAgLy8gSXQncyBpbXBvcnRhbnQgdGhhdCB0aGUgY2FsbGJhY2sgaXMgY2FsbGVkIG91dHNpZGUgdHJ5L2NhdGNoXG4gIC8vIHRvIGF2b2lkIGRvdWJsZSBjYWxsYmFja1xuICBpZiAoIWVycm9yKSB7XG4gICAgcmV0dXJuIGZuKG51bGwsIHJlcyk7XG4gIH1cblxuICBlcnJvci5yZXNwb25zZSA9IHJlcztcbiAgaWYgKHRoaXMuX21heFJldHJpZXMpIGVycm9yLnJldHJpZXMgPSB0aGlzLl9yZXRyaWVzIC0gMTtcblxuICAvLyBvbmx5IGVtaXQgZXJyb3IgZXZlbnQgaWYgdGhlcmUgaXMgYSBsaXN0ZW5lclxuICAvLyBvdGhlcndpc2Ugd2UgYXNzdW1lIHRoZSBjYWxsYmFjayB0byBgLmVuZCgpYCB3aWxsIGdldCB0aGUgZXJyb3JcbiAgaWYgKGVycm9yICYmIHRoaXMubGlzdGVuZXJzKCdlcnJvcicpLmxlbmd0aCA+IDApIHtcbiAgICB0aGlzLmVtaXQoJ2Vycm9yJywgZXJyb3IpO1xuICB9XG5cbiAgZm4oZXJyb3IsIHJlcyk7XG59O1xuXG4vKipcbiAqIENoZWNrIGlmIGBvYmpgIGlzIGEgaG9zdCBvYmplY3QsXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9iaiBob3N0IG9iamVjdFxuICogQHJldHVybiB7Qm9vbGVhbn0gaXMgYSBob3N0IG9iamVjdFxuICogQGFwaSBwcml2YXRlXG4gKi9cblJlcXVlc3QucHJvdG90eXBlLl9pc0hvc3QgPSBmdW5jdGlvbiAob2JqZWN0KSB7XG4gIHJldHVybiAoXG4gICAgQnVmZmVyLmlzQnVmZmVyKG9iamVjdCkgfHxcbiAgICBvYmplY3QgaW5zdGFuY2VvZiBTdHJlYW0gfHxcbiAgICBvYmplY3QgaW5zdGFuY2VvZiBGb3JtRGF0YVxuICApO1xufTtcblxuLyoqXG4gKiBJbml0aWF0ZSByZXF1ZXN0LCBpbnZva2luZyBjYWxsYmFjayBgZm4oZXJyLCByZXMpYFxuICogd2l0aCBhbiBpbnN0YW5jZW9mIGBSZXNwb25zZWAuXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5fZW1pdFJlc3BvbnNlID0gZnVuY3Rpb24gKGJvZHksIGZpbGVzKSB7XG4gIGNvbnN0IHJlc3BvbnNlID0gbmV3IFJlc3BvbnNlKHRoaXMpO1xuICB0aGlzLnJlc3BvbnNlID0gcmVzcG9uc2U7XG4gIHJlc3BvbnNlLnJlZGlyZWN0cyA9IHRoaXMuX3JlZGlyZWN0TGlzdDtcbiAgaWYgKHVuZGVmaW5lZCAhPT0gYm9keSkge1xuICAgIHJlc3BvbnNlLmJvZHkgPSBib2R5O1xuICB9XG5cbiAgcmVzcG9uc2UuZmlsZXMgPSBmaWxlcztcbiAgaWYgKHRoaXMuX2VuZENhbGxlZCkge1xuICAgIHJlc3BvbnNlLnBpcGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIFwiZW5kKCkgaGFzIGFscmVhZHkgYmVlbiBjYWxsZWQsIHNvIGl0J3MgdG9vIGxhdGUgdG8gc3RhcnQgcGlwaW5nXCJcbiAgICAgICk7XG4gICAgfTtcbiAgfVxuXG4gIHRoaXMuZW1pdCgncmVzcG9uc2UnLCByZXNwb25zZSk7XG4gIHJldHVybiByZXNwb25zZTtcbn07XG5cbi8qKlxuICogRW1pdCBgcmVkaXJlY3RgIGV2ZW50LCBwYXNzaW5nIGFuIGluc3RhbmNlb2YgYFJlc3BvbnNlYC5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5fZW1pdFJlZGlyZWN0ID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCByZXNwb25zZSA9IG5ldyBSZXNwb25zZSh0aGlzKTtcbiAgcmVzcG9uc2UucmVkaXJlY3RzID0gdGhpcy5fcmVkaXJlY3RMaXN0O1xuICB0aGlzLmVtaXQoJ3JlZGlyZWN0JywgcmVzcG9uc2UpO1xufTtcblxuLyoqXG4gKiBFbWl0IGEgcmVkaXJlY3QgcmVzcG9uc2UgYmVmb3JlIHRoZSByZXF1ZXN0IFVSTCBpcyBjaGFuZ2VkLlxuICpcbiAqIEBwYXJhbSB7SW5jb21pbmdNZXNzYWdlfSByZXNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJlcXVlc3QucHJvdG90eXBlLl9lbWl0UHJlUmVkaXJlY3QgPSBmdW5jdGlvbiAocmVzKSB7XG4gIHRoaXMucmVzID0gcmVzO1xuICBjb25zdCByZXNwb25zZSA9IG5ldyBSZXNwb25zZSh0aGlzKTtcbiAgcmVzcG9uc2UucmVkaXJlY3RzID0gdGhpcy5fcmVkaXJlY3RMaXN0O1xuICB0aGlzLmVtaXQoJ3ByZS1yZWRpcmVjdCcsIHJlc3BvbnNlKTtcbn07XG5cblJlcXVlc3QucHJvdG90eXBlLmVuZCA9IGZ1bmN0aW9uIChmbikge1xuICB0cnkge1xuICAgIHRoaXMucmVxdWVzdCgpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICB0aGlzLl9lbmRDYWxsZWQgPSB0cnVlO1xuICAgIGlmICh0eXBlb2YgZm4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRoaXMuX2NhbGxiYWNrID0gZm47XG4gICAgICB0aGlzLmNhbGxiYWNrKGVycik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhyb3cgZXJyO1xuICB9XG5cbiAgZGVidWcoJyVzICVzJywgdGhpcy5tZXRob2QsIHRoaXMudXJsKTtcblxuICBpZiAodGhpcy5fZW5kQ2FsbGVkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgJy5lbmQoKSB3YXMgY2FsbGVkIHR3aWNlLiBUaGlzIGlzIG5vdCBzdXBwb3J0ZWQgaW4gc3VwZXJhZ2VudCdcbiAgICApO1xuICB9XG5cbiAgdGhpcy5fZW5kQ2FsbGVkID0gdHJ1ZTtcblxuICAvLyBzdG9yZSBjYWxsYmFja1xuICB0aGlzLl9jYWxsYmFjayA9IGZuIHx8IG5vb3A7XG5cbiAgdGhpcy5fZW5kKCk7XG59O1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5fZW5kID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5fYWJvcnRlZClcbiAgICByZXR1cm4gdGhpcy5jYWxsYmFjayhcbiAgICAgIG5ldyBFcnJvcignVGhlIHJlcXVlc3QgaGFzIGJlZW4gYWJvcnRlZCBldmVuIGJlZm9yZSAuZW5kKCkgd2FzIGNhbGxlZCcpXG4gICAgKTtcblxuICBsZXQgZGF0YSA9IHRoaXMuX2RhdGE7XG4gIGNvbnN0IHsgcmVxIH0gPSB0aGlzO1xuICBjb25zdCB7IG1ldGhvZCB9ID0gdGhpcztcblxuICB0aGlzLl9zZXRUaW1lb3V0cygpO1xuXG4gIC8vIGJvZHlcbiAgaWYgKG1ldGhvZCAhPT0gJ0hFQUQnICYmICFyZXEuX2hlYWRlclNlbnQpIHtcbiAgICB0cnkge1xuICAgICAgLy8gc2VyaWFsaXplIHN0dWZmXG4gICAgICBpZiAodHlwZW9mIGRhdGEgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGxldCBjb250ZW50VHlwZSA9IHJlcS5nZXRIZWFkZXIoJ0NvbnRlbnQtVHlwZScpO1xuICAgICAgICAvLyBQYXJzZSBvdXQganVzdCB0aGUgY29udGVudCB0eXBlIGZyb20gdGhlIGhlYWRlciAoaWdub3JlIHRoZSBjaGFyc2V0KVxuICAgICAgICBpZiAoY29udGVudFR5cGUpIGNvbnRlbnRUeXBlID0gY29udGVudFR5cGUuc3BsaXQoJzsnKVswXTtcbiAgICAgICAgbGV0IHNlcmlhbGl6ZSA9XG4gICAgICAgICAgdGhpcy5fc2VyaWFsaXplciB8fFxuICAgICAgICAgIChoYXNPd24oZXhwb3J0cy5zZXJpYWxpemUsIGNvbnRlbnRUeXBlKVxuICAgICAgICAgICAgPyBleHBvcnRzLnNlcmlhbGl6ZVtjb250ZW50VHlwZV1cbiAgICAgICAgICAgIDogdW5kZWZpbmVkKTtcbiAgICAgICAgaWYgKCFzZXJpYWxpemUgJiYgaXNKU09OKGNvbnRlbnRUeXBlKSkge1xuICAgICAgICAgIHNlcmlhbGl6ZSA9IGV4cG9ydHMuc2VyaWFsaXplWydhcHBsaWNhdGlvbi9qc29uJ107XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2VyaWFsaXplKSBkYXRhID0gc2VyaWFsaXplKGRhdGEpO1xuICAgICAgfVxuXG4gICAgICAvLyBjb250ZW50LWxlbmd0aFxuICAgICAgaWYgKGRhdGEgJiYgIXJlcS5nZXRIZWFkZXIoJ0NvbnRlbnQtTGVuZ3RoJykpIHtcbiAgICAgICAgcmVxLnNldEhlYWRlcihcbiAgICAgICAgICAnQ29udGVudC1MZW5ndGgnLFxuICAgICAgICAgIEJ1ZmZlci5pc0J1ZmZlcihkYXRhKSA/IGRhdGEubGVuZ3RoIDogQnVmZmVyLmJ5dGVMZW5ndGgoZGF0YSlcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIHJldHVybiB0aGlzLl9mYWlsUmVxdWVzdChlcnIpO1xuICAgIH1cbiAgfVxuXG4gIGxldCBzdHJlYW1SZXNwb25zZTtcbiAgaWYgKHRoaXMuX3N0cmVhbVJlc3BvbnNlTGlzdGVuZXIpIHtcbiAgICByZXEucmVtb3ZlTGlzdGVuZXIoJ3Jlc3BvbnNlJywgdGhpcy5fc3RyZWFtUmVzcG9uc2VMaXN0ZW5lcik7XG4gICAgdGhpcy5fc3RyZWFtUmVzcG9uc2VMaXN0ZW5lciA9IHVuZGVmaW5lZDtcbiAgICBzdHJlYW1SZXNwb25zZSA9IHRoaXMuX3N0cmVhbVJlc3BvbnNlO1xuICAgIHRoaXMuX3N0cmVhbVJlc3BvbnNlID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgLy8gcmVzcG9uc2VcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGNvbXBsZXhpdHlcbiAgY29uc3QgaGFuZGxlUmVzcG9uc2UgPSAocmVzKSA9PiB7XG4gICAgZGVidWcoJyVzICVzIC0+ICVzJywgdGhpcy5tZXRob2QsIHRoaXMudXJsLCByZXMuc3RhdHVzQ29kZSk7XG5cbiAgICBpZiAodGhpcy5fcmVzcG9uc2VUaW1lb3V0VGltZXIpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aGlzLl9yZXNwb25zZVRpbWVvdXRUaW1lcik7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMucGlwZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBtYXggPSB0aGlzLl9tYXhSZWRpcmVjdHM7XG4gICAgY29uc3QgbWltZSA9IHV0aWxzLnR5cGUocmVzLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddIHx8ICcnKSB8fCAndGV4dC9wbGFpbic7XG4gICAgbGV0IHR5cGUgPSBtaW1lLnNwbGl0KCcvJylbMF07XG4gICAgaWYgKHR5cGUpIHR5cGUgPSB0eXBlLnRvTG93ZXJDYXNlKCkudHJpbSgpO1xuICAgIGNvbnN0IG11bHRpcGFydCA9IHR5cGUgPT09ICdtdWx0aXBhcnQnO1xuICAgIGNvbnN0IHJlZGlyZWN0ID0gaXNSZWRpcmVjdChyZXMuc3RhdHVzQ29kZSk7XG4gICAgY29uc3QgcmVzcG9uc2VUeXBlID0gdGhpcy5fcmVzcG9uc2VUeXBlO1xuXG4gICAgdGhpcy5yZXMgPSByZXM7XG5cbiAgICAvLyByZWRpcmVjdFxuICAgIGlmIChyZWRpcmVjdCAmJiB0aGlzLl9yZWRpcmVjdHMrKyAhPT0gbWF4KSB7XG4gICAgICByZXR1cm4gdGhpcy5fcmVkaXJlY3QocmVzKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5tZXRob2QgPT09ICdIRUFEJykge1xuICAgICAgdGhpcy5lbWl0KCdlbmQnKTtcbiAgICAgIHRoaXMuY2FsbGJhY2sobnVsbCwgdGhpcy5fZW1pdFJlc3BvbnNlKCkpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIHpsaWIgc3VwcG9ydFxuICAgIGxldCBkZWNvbXByZXNzZXIgPSBudWxsO1xuICAgIGlmICh0aGlzLl9zaG91bGREZWNvbXByZXNzKHJlcykpIHtcbiAgICAgIGRlY29tcHJlc3NlciA9IGRlY29tcHJlc3MocmVxLCByZXMpO1xuICAgIH1cblxuICAgIGxldCBidWZmZXIgPSB0aGlzLl9idWZmZXI7XG4gICAgaWYgKGJ1ZmZlciA9PT0gdW5kZWZpbmVkICYmIGhhc093bihleHBvcnRzLmJ1ZmZlciwgbWltZSkpIHtcbiAgICAgIGJ1ZmZlciA9IEJvb2xlYW4oZXhwb3J0cy5idWZmZXJbbWltZV0pO1xuICAgIH1cblxuICAgIGxldCBwYXJzZXIgPSB0aGlzLl9wYXJzZXI7XG4gICAgaWYgKHVuZGVmaW5lZCA9PT0gYnVmZmVyICYmIHBhcnNlcikge1xuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBcIkEgY3VzdG9tIHN1cGVyYWdlbnQgcGFyc2VyIGhhcyBiZWVuIHNldCwgYnV0IGJ1ZmZlcmluZyBzdHJhdGVneSBmb3IgdGhlIHBhcnNlciBoYXNuJ3QgYmVlbiBjb25maWd1cmVkLiBDYWxsIGByZXEuYnVmZmVyKHRydWUgb3IgZmFsc2UpYCBvciBzZXQgYHN1cGVyYWdlbnQuYnVmZmVyW21pbWVdID0gdHJ1ZSBvciBmYWxzZWBcIlxuICAgICAgKTtcbiAgICAgIGJ1ZmZlciA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKCFwYXJzZXIpIHtcbiAgICAgIGlmIChyZXNwb25zZVR5cGUpIHtcbiAgICAgICAgcGFyc2VyID0gZXhwb3J0cy5wYXJzZS5pbWFnZTsgLy8gSXQncyBhY3R1YWxseSBhIGdlbmVyaWMgQnVmZmVyXG4gICAgICAgIGJ1ZmZlciA9IHRydWU7XG4gICAgICB9IGVsc2UgaWYgKG11bHRpcGFydCkge1xuICAgICAgICBjb25zdCBmb3JtID0gZm9ybWlkYWJsZS5mb3JtaWRhYmxlKCk7XG4gICAgICAgIHBhcnNlciA9IChyZXMsIGNhbGxiYWNrKSA9PiB7XG4gICAgICAgICAgLy8gQ3JlYXRlIGEgUGFzc1Rocm91Z2ggc3RyZWFtIHRoYXQgYWN0cyBhcyBhIHByb3BlciBIVFRQIHJlcXVlc3RcbiAgICAgICAgICBjb25zdCBicmlkZ2VTdHJlYW0gPSBuZXcgU3RyZWFtLlBhc3NUaHJvdWdoKCk7XG5cbiAgICAgICAgICAvLyBBZGQgSFRUUCByZXF1ZXN0IHByb3BlcnRpZXMgZnJvbSB0aGUgY3VycmVudCByZXF1ZXN0IGNvbnRleHRcbiAgICAgICAgICBicmlkZ2VTdHJlYW0ubWV0aG9kID0gdGhpcy5tZXRob2QgfHwgJ1BPU1QnO1xuICAgICAgICAgIGJyaWRnZVN0cmVhbS51cmwgPSB0aGlzLnVybCB8fCAnLyc7XG4gICAgICAgICAgYnJpZGdlU3RyZWFtLmh0dHBWZXJzaW9uID0gcmVzLmh0dHBWZXJzaW9uIHx8ICcxLjEnO1xuICAgICAgICAgIGJyaWRnZVN0cmVhbS5oZWFkZXJzID0gcmVzLmhlYWRlcnMgfHwge307XG4gICAgICAgICAgYnJpZGdlU3RyZWFtLnNvY2tldCA9IHJlcy5zb2NrZXQgfHwgeyByZWFkYWJsZTogdHJ1ZSB9O1xuXG4gICAgICAgICAgLy8gUGlwZSB0aGUgcmVzcG9uc2UgZGF0YSB0aHJvdWdoIHRoZSBicmlkZ2Ugc3RyZWFtXG4gICAgICAgICAgcmVzLnBpcGUoYnJpZGdlU3RyZWFtKTtcblxuICAgICAgICAgIGZvcm0ucGFyc2UoYnJpZGdlU3RyZWFtLCAoZXJyLCBmaWVsZHMsIGZpbGVzKSA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyKSByZXR1cm4gY2FsbGJhY2soZXJyKTtcblxuICAgICAgICAgICAgLy8gRm9ybWlkYWJsZSB2MyBhbHdheXMgcmV0dXJucyBhcnJheXMsIGJ1dCBTdXBlckFnZW50IGV4cGVjdHMgc2luZ2xlIHZhbHVlc1xuICAgICAgICAgICAgLy8gRmxhdHRlbiBzaW5nbGUtaXRlbSBhcnJheXMgdG8gbWFpbnRhaW4gYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICAgICAgICAgICAgY29uc3QgZmxhdHRlbmVkRmllbGRzID0ge307XG4gICAgICAgICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIGZpZWxkcykge1xuICAgICAgICAgICAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGZpZWxkcywga2V5KSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBmaWVsZHNba2V5XTtcbiAgICAgICAgICAgICAgICBmbGF0dGVuZWRGaWVsZHNba2V5XSA9XG4gICAgICAgICAgICAgICAgICBBcnJheS5pc0FycmF5KHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDEgPyB2YWx1ZVswXSA6IHZhbHVlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGZsYXR0ZW5lZEZpbGVzID0ge307XG4gICAgICAgICAgICBpZiAoZmlsZXMpIHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZmlsZXMpIHtcbiAgICAgICAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWxlcywga2V5KSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBmaWxlc1trZXldO1xuICAgICAgICAgICAgICAgIGZsYXR0ZW5lZEZpbGVzW2tleV0gPVxuICAgICAgICAgICAgICAgICAgQXJyYXkuaXNBcnJheSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAxID8gdmFsdWVbMF0gOiB2YWx1ZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZXR1cm4gZmxhdHRlbmVkIGZpZWxkcyBhcyB0aGUgb2JqZWN0IHBhcmFtZXRlciB0byBtYXRjaCBTdXBlckFnZW50J3MgZXhwZWN0ZWQgZm9ybWF0XG4gICAgICAgICAgICBjYWxsYmFjayhudWxsLCBmbGF0dGVuZWRGaWVsZHMsIGZsYXR0ZW5lZEZpbGVzKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfTtcblxuICAgICAgICBidWZmZXIgPSB0cnVlO1xuICAgICAgfSBlbHNlIGlmIChpc0JpbmFyeShtaW1lKSkge1xuICAgICAgICBwYXJzZXIgPSBleHBvcnRzLnBhcnNlLmltYWdlO1xuICAgICAgICBidWZmZXIgPSBidWZmZXIgIT09IGZhbHNlOyAvLyBGb3IgYmFja3dhcmRzLWNvbXBhdGliaWxpdHkgYnVmZmVyaW5nIGRlZmF1bHQgaXMgYWQtaG9jIE1JTUUtZGVwZW5kZW50XG4gICAgICB9IGVsc2UgaWYgKGhhc093bihleHBvcnRzLnBhcnNlLCBtaW1lKSkge1xuICAgICAgICAvLyBgbWltZWAgaXMgYXR0YWNrZXIgY29udHJvbGxlZDsgYW4gaW5oZXJpdGVkIGtleSBzdWNoIGFzXG4gICAgICAgIC8vIFwiY29uc3RydWN0b3JcIiBtdXN0IG5vdCByZXNvbHZlIHRvIGEgcGFyc2VyXG4gICAgICAgIHBhcnNlciA9IGV4cG9ydHMucGFyc2VbbWltZV07XG4gICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICd0ZXh0Jykge1xuICAgICAgICBwYXJzZXIgPSBleHBvcnRzLnBhcnNlLnRleHQ7XG4gICAgICAgIGJ1ZmZlciA9IGJ1ZmZlciAhPT0gZmFsc2U7XG4gICAgICAgIC8vIGV2ZXJ5b25lIHdhbnRzIHRoZWlyIG93biB3aGl0ZS1sYWJlbGVkIGpzb25cbiAgICAgIH0gZWxzZSBpZiAoaXNKU09OKG1pbWUpKSB7XG4gICAgICAgIHBhcnNlciA9IGV4cG9ydHMucGFyc2VbJ2FwcGxpY2F0aW9uL2pzb24nXTtcbiAgICAgICAgYnVmZmVyID0gYnVmZmVyICE9PSBmYWxzZTtcbiAgICAgIH0gZWxzZSBpZiAoYnVmZmVyKSB7XG4gICAgICAgIHBhcnNlciA9IGV4cG9ydHMucGFyc2UudGV4dDtcbiAgICAgIH0gZWxzZSBpZiAodW5kZWZpbmVkID09PSBidWZmZXIpIHtcbiAgICAgICAgcGFyc2VyID0gZXhwb3J0cy5wYXJzZS5pbWFnZTsgLy8gSXQncyBhY3R1YWxseSBhIGdlbmVyaWMgQnVmZmVyXG4gICAgICAgIGJ1ZmZlciA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gYnkgZGVmYXVsdCBvbmx5IGJ1ZmZlciB0ZXh0LyosIGpzb24gYW5kIG1lc3NlZCB1cCB0aGluZyBmcm9tIGhlbGxcbiAgICBpZiAoKHVuZGVmaW5lZCA9PT0gYnVmZmVyICYmIGlzVGV4dChtaW1lKSkgfHwgaXNKU09OKG1pbWUpKSB7XG4gICAgICBidWZmZXIgPSB0cnVlO1xuICAgIH1cblxuICAgIHRoaXMuX3Jlc0J1ZmZlcmVkID0gYnVmZmVyO1xuICAgIGxldCBwYXJzZXJIYW5kbGVzRW5kID0gZmFsc2U7XG4gICAgaWYgKGJ1ZmZlcikge1xuICAgICAgLy8gUHJvdGVjdGlvbiBhZ2FpbnN0IHppcCBib21icyBhbmQgb3RoZXIgbnVpc2FuY2VcbiAgICAgIGxldCByZXNwb25zZUJ5dGVzTGVmdCA9IHRoaXMuX21heFJlc3BvbnNlU2l6ZSB8fCAyMDAwMDAwMDA7XG4gICAgICBsZXQgZXhjZWVkZWQgPSBmYWxzZTtcbiAgICAgIHJlcy5vbignZGF0YScsIChidWYpID0+IHtcbiAgICAgICAgaWYgKGV4Y2VlZGVkKSByZXR1cm47XG4gICAgICAgIC8vIFBhcnNlcnMgbWF5IGhhdmUgY2FsbGVkIGBzZXRFbmNvZGluZygpYCwgaW4gd2hpY2ggY2FzZSBjaHVua3MgYXJlXG4gICAgICAgIC8vIHN0cmluZ3M6IGNvdW50IHRoZWlyIGVuY29kZWQgc2l6ZSByYXRoZXIgdGhhbiB0aGVpciBVVEYtMTYgbGVuZ3RoXG4gICAgICAgIHJlc3BvbnNlQnl0ZXNMZWZ0IC09IEJ1ZmZlci5pc0J1ZmZlcihidWYpXG4gICAgICAgICAgPyBidWYubGVuZ3RoXG4gICAgICAgICAgOiBCdWZmZXIuYnl0ZUxlbmd0aChTdHJpbmcoYnVmKSk7XG4gICAgICAgIGlmIChyZXNwb25zZUJ5dGVzTGVmdCA8IDApIHtcbiAgICAgICAgICBleGNlZWRlZCA9IHRydWU7XG4gICAgICAgICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ01heGltdW0gcmVzcG9uc2Ugc2l6ZSByZWFjaGVkJyk7XG4gICAgICAgICAgZXJyb3IuY29kZSA9ICdFVE9PTEFSR0UnO1xuICAgICAgICAgIC8vIFBhcnNlcnMgYXJlbid0IHJlcXVpcmVkIHRvIG9ic2VydmUgZXJyb3IgZXZlbnQsXG4gICAgICAgICAgLy8gc28gd291bGQgaW5jb3JyZWN0bHkgcmVwb3J0IHN1Y2Nlc3NcbiAgICAgICAgICBwYXJzZXJIYW5kbGVzRW5kID0gZmFsc2U7XG4gICAgICAgICAgLy8gQSBkZWNvbXByZXNzaW9uIGJvbWIga2VlcHMgaW5mbGF0aW5nIChhbmQgZW1pdHRpbmcpIGxvbmcgYWZ0ZXJcbiAgICAgICAgICAvLyB0aGUgY29tcHJlc3NlZCBpbnB1dCB3YXMgY29uc3VtZWQ7IHN0b3AgaXQgaGVyZSBzbyB0aGUgbGltaXRcbiAgICAgICAgICAvLyBhbHNvIGJvdW5kcyBDUFUgYW5kIGF2b2lkcyBhIGZsb29kIG9mIGxhdGUgY2FsbGJhY2tzLlxuICAgICAgICAgIGlmIChkZWNvbXByZXNzZXIpIGRlY29tcHJlc3Nlci5kZXN0cm95KCk7XG4gICAgICAgICAgLy8gRGVzdHJveSB3aXRob3V0IGFuIGVycm9yOiBJbmNvbWluZ01lc3NhZ2UuZGVzdHJveShlcnIpIGVtaXRzXG4gICAgICAgICAgLy8gJ2Vycm9yJywgYW5kIHRoZSBwYXJzZXIgbWF5IGFsc28gZmFpbCwgZWFjaCBvZiB3aGljaCB3b3VsZFxuICAgICAgICAgIC8vIGNhbGwgY2FsbGJhY2soKSBhZ2FpbiAoXCJzdXBlcmFnZW50OiBkb3VibGUgY2FsbGJhY2sgYnVnXCIpLlxuICAgICAgICAgIHJlcy5kZXN0cm95KCk7XG4gICAgICAgICAgdGhpcy5jYWxsYmFjayhlcnJvciwgbnVsbCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChwYXJzZXIgJiYgIWJ1ZmZlciAmJiBCVUZGRVJJTkdfUEFSU0VSUy5oYXMocGFyc2VyKSkge1xuICAgICAgLy8gVGhlIGJ1aWx0LWluIHBhcnNlcnMgZXhpc3Qgb25seSB0byBhY2N1bXVsYXRlIHRoZSBib2R5LiBXaGVuIHRoZVxuICAgICAgLy8gcmVzcG9uc2UgaXMgbm90IGJ1ZmZlcmVkIChgLmJ1ZmZlcihmYWxzZSlgLCBvciBhbiB1bmJ1ZmZlcmVkIGRlZmF1bHRcbiAgICAgIC8vIHN1Y2ggYXMgYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtKSB0aGV5IHdvdWxkIHN0aWxsIGNvbGxlY3QgdGhlIGVudGlyZVxuICAgICAgLy8gc3RyZWFtIGluIG1lbW9yeSwgd2l0aG91dCBhbnkgc2l6ZSBsaW1pdCwgd2hpbGUgdGhlIHJlc3BvbnNlIGhhc1xuICAgICAgLy8gYWxyZWFkeSBiZWVuIGhhbmRlZCBvdXQgdG8gdGhlIGNhbGxlci4gS2VlcCBvbmx5IHRoZSBlbmNvZGluZyB0aGV5XG4gICAgICAvLyB3b3VsZCBoYXZlIGFwcGxpZWQgc28gYHJlcy5vbignZGF0YScpYCBjb25zdW1lcnMgc2VlIHRoZSBzYW1lIGNodW5rcy5cbiAgICAgIGlmIChwYXJzZXIgPT09IEJVSUxUX0lOX1BBUlNFUlNbJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCddKSB7XG4gICAgICAgIHJlcy5zZXRFbmNvZGluZygnYXNjaWknKTtcbiAgICAgIH0gZWxzZSBpZiAocGFyc2VyICE9PSBCVUlMVF9JTl9QQVJTRVJTLmltYWdlKSB7XG4gICAgICAgIHJlcy5zZXRFbmNvZGluZygndXRmOCcpO1xuICAgICAgfVxuXG4gICAgICBwYXJzZXIgPSBudWxsO1xuICAgIH1cblxuICAgIGlmIChwYXJzZXIpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIFVuYnVmZmVyZWQgcGFyc2VycyBhcmUgc3VwcG9zZWQgdG8gZW1pdCByZXNwb25zZSBlYXJseSxcbiAgICAgICAgLy8gd2hpY2ggaXMgd2VpcmQgQlRXLCBiZWNhdXNlIHJlc3BvbnNlLmJvZHkgd29uJ3QgYmUgdGhlcmUuXG4gICAgICAgIHBhcnNlckhhbmRsZXNFbmQgPSBidWZmZXI7XG5cbiAgICAgICAgcGFyc2VyKHJlcywgKGVycm9yLCBvYmplY3QsIGZpbGVzKSA9PiB7XG4gICAgICAgICAgaWYgKHRoaXMudGltZWRvdXQgfHwgdGhpcy5jYWxsZWQpIHtcbiAgICAgICAgICAgIC8vIFRpbWVvdXQgb3IgbWF4UmVzcG9uc2VTaXplIGhhcyBhbHJlYWR5IGhhbmRsZWQgYWxsIGNhbGxiYWNrc1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIEludGVudGlvbmFsIChub24tdGltZW91dCkgYWJvcnQgaXMgc3VwcG9zZWQgdG8gcHJlc2VydmUgcGFydGlhbCByZXNwb25zZSxcbiAgICAgICAgICAvLyBldmVuIGlmIGl0IGRvZXNuJ3QgcGFyc2UuXG4gICAgICAgICAgaWYgKGVycm9yICYmICF0aGlzLl9hYm9ydGVkKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jYWxsYmFjayhlcnJvcik7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHBhcnNlckhhbmRsZXNFbmQpIHtcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnZW5kJyk7XG4gICAgICAgICAgICB0aGlzLmNhbGxiYWNrKG51bGwsIHRoaXMuX2VtaXRSZXNwb25zZShvYmplY3QsIGZpbGVzKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICB0aGlzLmNhbGxiYWNrKGVycik7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLnJlcyA9IHJlcztcblxuICAgIC8vIHVuYnVmZmVyZWRcbiAgICBpZiAoIWJ1ZmZlcikge1xuICAgICAgZGVidWcoJ3VuYnVmZmVyZWQgJXMgJXMnLCB0aGlzLm1ldGhvZCwgdGhpcy51cmwpO1xuICAgICAgdGhpcy5jYWxsYmFjayhudWxsLCB0aGlzLl9lbWl0UmVzcG9uc2UoKSk7XG4gICAgICBpZiAobXVsdGlwYXJ0KSByZXR1cm47IC8vIGFsbG93IG11bHRpcGFydCB0byBoYW5kbGUgZW5kIGV2ZW50XG4gICAgICByZXMub25jZSgnZW5kJywgKCkgPT4ge1xuICAgICAgICBkZWJ1ZygnZW5kICVzICVzJywgdGhpcy5tZXRob2QsIHRoaXMudXJsKTtcbiAgICAgICAgdGhpcy5lbWl0KCdlbmQnKTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbXBsZXRlQWJvcnRlZFJlc3BvbnNlID0gKCkgPT4ge1xuICAgICAgaWYgKCF0aGlzLl9hYm9ydGVkKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgcGFyc2VySGFuZGxlc0VuZCA9IGZhbHNlO1xuICAgICAgaWYgKCF0aGlzLmNhbGxlZCkge1xuICAgICAgICB0aGlzLmVtaXQoJ2VuZCcpO1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IHRoaXMuX2VtaXRSZXNwb25zZSgpO1xuICAgICAgICByZXNwb25zZS5vbignZXJyb3InLCBub29wKTtcbiAgICAgICAgdGhpcy5jYWxsYmFjayhudWxsLCByZXNwb25zZSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH07XG5cbiAgICAvLyB0ZXJtaW5hdGluZyBldmVudHNcbiAgICByZXMub25jZSgnZXJyb3InLCAoZXJyb3IpID0+IHtcbiAgICAgIGlmIChjb21wbGV0ZUFib3J0ZWRSZXNwb25zZSgpKSByZXR1cm47XG4gICAgICBwYXJzZXJIYW5kbGVzRW5kID0gZmFsc2U7XG4gICAgICB0aGlzLmNhbGxiYWNrKGVycm9yLCBudWxsKTtcbiAgICB9KTtcbiAgICByZXMub25jZSgnYWJvcnRlZCcsIGNvbXBsZXRlQWJvcnRlZFJlc3BvbnNlKTtcbiAgICByZXMub25jZSgnY2xvc2UnLCBjb21wbGV0ZUFib3J0ZWRSZXNwb25zZSk7XG4gICAgaWYgKCFwYXJzZXJIYW5kbGVzRW5kKVxuICAgICAgcmVzLm9uY2UoJ2VuZCcsICgpID0+IHtcbiAgICAgICAgZGVidWcoJ2VuZCAlcyAlcycsIHRoaXMubWV0aG9kLCB0aGlzLnVybCk7XG4gICAgICAgIC8vIFRPRE86IHVubGVzcyBidWZmZXJpbmcgZW1pdCBlYXJsaWVyIHRvIHN0cmVhbVxuICAgICAgICB0aGlzLmVtaXQoJ2VuZCcpO1xuICAgICAgICB0aGlzLmNhbGxiYWNrKG51bGwsIHRoaXMuX2VtaXRSZXNwb25zZSgpKTtcbiAgICAgIH0pO1xuICB9O1xuXG4gIGlmIChzdHJlYW1SZXNwb25zZSkge1xuICAgIHByb2Nlc3MubmV4dFRpY2soaGFuZGxlUmVzcG9uc2UsIHN0cmVhbVJlc3BvbnNlKTtcbiAgfSBlbHNlIHtcbiAgICByZXEub25jZSgncmVzcG9uc2UnLCBoYW5kbGVSZXNwb25zZSk7XG4gIH1cblxuICB0aGlzLmVtaXQoJ3JlcXVlc3QnLCB0aGlzKTtcblxuICBjb25zdCBnZXRQcm9ncmVzc01vbml0b3IgPSAoKSA9PiB7XG4gICAgY29uc3QgbGVuZ3RoQ29tcHV0YWJsZSA9IHRydWU7XG4gICAgY29uc3QgdG90YWwgPSByZXEuZ2V0SGVhZGVyKCdDb250ZW50LUxlbmd0aCcpO1xuICAgIGxldCBsb2FkZWQgPSAwO1xuXG4gICAgY29uc3QgcHJvZ3Jlc3MgPSBuZXcgU3RyZWFtLlRyYW5zZm9ybSgpO1xuICAgIHByb2dyZXNzLl90cmFuc2Zvcm0gPSAoY2h1bmssIGVuY29kaW5nLCBjYWxsYmFjaykgPT4ge1xuICAgICAgbG9hZGVkICs9IGNodW5rLmxlbmd0aDtcbiAgICAgIHRoaXMuZW1pdCgncHJvZ3Jlc3MnLCB7XG4gICAgICAgIGRpcmVjdGlvbjogJ3VwbG9hZCcsXG4gICAgICAgIGxlbmd0aENvbXB1dGFibGUsXG4gICAgICAgIGxvYWRlZCxcbiAgICAgICAgdG90YWxcbiAgICAgIH0pO1xuICAgICAgY2FsbGJhY2sobnVsbCwgY2h1bmspO1xuICAgIH07XG5cbiAgICByZXR1cm4gcHJvZ3Jlc3M7XG4gIH07XG5cbiAgY29uc3QgYnVmZmVyVG9DaHVua3MgPSAoYnVmZmVyKSA9PiB7XG4gICAgY29uc3QgY2h1bmtTaXplID0gMTYgKiAxMDI0OyAvLyBkZWZhdWx0IGhpZ2hXYXRlck1hcmsgdmFsdWVcbiAgICBjb25zdCBjaHVua2luZyA9IG5ldyBTdHJlYW0uUmVhZGFibGUoKTtcbiAgICBjb25zdCB0b3RhbExlbmd0aCA9IGJ1ZmZlci5sZW5ndGg7XG4gICAgY29uc3QgcmVtYWluZGVyID0gdG90YWxMZW5ndGggJSBjaHVua1NpemU7XG4gICAgY29uc3QgY3V0b2ZmID0gdG90YWxMZW5ndGggLSByZW1haW5kZXI7XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGN1dG9mZjsgaSArPSBjaHVua1NpemUpIHtcbiAgICAgIGNvbnN0IGNodW5rID0gYnVmZmVyLnNsaWNlKGksIGkgKyBjaHVua1NpemUpO1xuICAgICAgY2h1bmtpbmcucHVzaChjaHVuayk7XG4gICAgfVxuXG4gICAgaWYgKHJlbWFpbmRlciA+IDApIHtcbiAgICAgIGNvbnN0IHJlbWFpbmRlckJ1ZmZlciA9IGJ1ZmZlci5zbGljZSgtcmVtYWluZGVyKTtcbiAgICAgIGNodW5raW5nLnB1c2gocmVtYWluZGVyQnVmZmVyKTtcbiAgICB9XG5cbiAgICBjaHVua2luZy5wdXNoKG51bGwpOyAvLyBubyBtb3JlIGRhdGFcblxuICAgIHJldHVybiBjaHVua2luZztcbiAgfTtcblxuICB0cnkge1xuICAgIC8vIGlmIGEgRm9ybURhdGEgaW5zdGFuY2UgZ290IGNyZWF0ZWQsIHRoZW4gd2Ugc2VuZCB0aGF0IGFzIHRoZSByZXF1ZXN0IGJvZHlcbiAgICBjb25zdCBmb3JtRGF0YSA9IHRoaXMuX2Zvcm1EYXRhO1xuICAgIGlmIChmb3JtRGF0YSkge1xuICAgICAgLy8gc2V0IGhlYWRlcnNcbiAgICAgIGNvbnN0IGhlYWRlcnMgPSBmb3JtRGF0YS5nZXRIZWFkZXJzKCk7XG4gICAgICBmb3IgKGNvbnN0IGkgaW4gaGVhZGVycykge1xuICAgICAgICBpZiAoaGFzT3duKGhlYWRlcnMsIGkpKSB7XG4gICAgICAgICAgZGVidWcoJ3NldHRpbmcgRm9ybURhdGEgaGVhZGVyOiBcIiVzOiAlc1wiJywgaSwgaGVhZGVyc1tpXSk7XG4gICAgICAgICAgcmVxLnNldEhlYWRlcihpLCBoZWFkZXJzW2ldKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBhdHRlbXB0IHRvIGdldCBcIkNvbnRlbnQtTGVuZ3RoXCIgaGVhZGVyXG4gICAgICBmb3JtRGF0YS5nZXRMZW5ndGgoKGVycm9yLCBsZW5ndGgpID0+IHtcbiAgICAgICAgLy8gVW5rbm93biBzdHJlYW0gbGVuZ3RocyBjYW4gdXNlIGNodW5rZWQgZW5jb2RpbmcsIGJ1dCBmaWxlc3lzdGVtXG4gICAgICAgIC8vIGVycm9ycyBtdXN0IGZhaWwgYmVmb3JlIGEgcGFydGlhbCBtdWx0aXBhcnQgcmVxdWVzdCBpcyBzZW50LlxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IgIT09ICdVbmtub3duIHN0cmVhbScpIHtcbiAgICAgICAgICB0aGlzLl9mYWlsUmVxdWVzdChlcnJvcik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZGVidWcoJ2dvdCBGb3JtRGF0YSBDb250ZW50LUxlbmd0aDogJXMnLCBsZW5ndGgpO1xuICAgICAgICBpZiAodHlwZW9mIGxlbmd0aCA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICByZXEuc2V0SGVhZGVyKCdDb250ZW50LUxlbmd0aCcsIGxlbmd0aCk7XG4gICAgICAgIH1cblxuICAgICAgICBmb3JtRGF0YS5waXBlKGdldFByb2dyZXNzTW9uaXRvcigpKS5waXBlKHJlcSk7XG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKEJ1ZmZlci5pc0J1ZmZlcihkYXRhKSkge1xuICAgICAgYnVmZmVyVG9DaHVua3MoZGF0YSkucGlwZShnZXRQcm9ncmVzc01vbml0b3IoKSkucGlwZShyZXEpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXEuZW5kKGRhdGEpO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgdGhpcy5fZmFpbFJlcXVlc3QoZXJyKTtcbiAgfVxufTtcblxuLy8gQ2hlY2sgd2hldGhlciByZXNwb25zZSBoYXMgYSBub24tMC1zaXplZCBnemlwLWVuY29kZWQgYm9keVxuUmVxdWVzdC5wcm90b3R5cGUuX3Nob3VsZERlY29tcHJlc3MgPSAocmVzKSA9PiB7XG4gIHJldHVybiAoXG4gICAgaGFzTm9uRW1wdHlSZXNwb25zZUNvbnRlbnQocmVzKSAmJlxuICAgIChpc0d6aXBPckRlZmxhdGVFbmNvZGluZyhyZXMpIHx8IGlzQnJvdGxpRW5jb2RpbmcocmVzKSlcbiAgKTtcbn07XG5cbi8qKlxuICogT3ZlcnJpZGVzIEROUyBmb3Igc2VsZWN0ZWQgaG9zdG5hbWVzLiBUYWtlcyBvYmplY3QgbWFwcGluZyBob3N0bmFtZXMgdG8gSVAgYWRkcmVzc2VzLlxuICpcbiAqIFdoZW4gbWFraW5nIGEgcmVxdWVzdCB0byBhIFVSTCB3aXRoIGEgaG9zdG5hbWUgZXhhY3RseSBtYXRjaGluZyBhIGtleSBpbiB0aGUgb2JqZWN0LFxuICogdXNlIHRoZSBnaXZlbiBJUCBhZGRyZXNzIHRvIGNvbm5lY3QsIGluc3RlYWQgb2YgdXNpbmcgRE5TIHRvIHJlc29sdmUgdGhlIGhvc3RuYW1lLlxuICpcbiAqIEEgc3BlY2lhbCBob3N0IGAqYCBtYXRjaGVzIGV2ZXJ5IGhvc3RuYW1lIChrZWVwIHJlZGlyZWN0cyBpbiBtaW5kISlcbiAqXG4gKiAgICAgIHJlcXVlc3QuY29ubmVjdCh7XG4gKiAgICAgICAgJ3Rlc3QuZXhhbXBsZS5jb20nOiAnMTI3LjAuMC4xJyxcbiAqICAgICAgICAnaXB2Ni5leGFtcGxlLmNvbSc6ICc6OjEnLFxuICogICAgICB9KVxuICovXG5SZXF1ZXN0LnByb3RvdHlwZS5jb25uZWN0ID0gZnVuY3Rpb24gKGNvbm5lY3RPdmVycmlkZSkge1xuICBpZiAodHlwZW9mIGNvbm5lY3RPdmVycmlkZSA9PT0gJ3N0cmluZycpIHtcbiAgICB0aGlzLl9jb25uZWN0T3ZlcnJpZGUgPSB7ICcqJzogY29ubmVjdE92ZXJyaWRlIH07XG4gIH0gZWxzZSBpZiAodHlwZW9mIGNvbm5lY3RPdmVycmlkZSA9PT0gJ29iamVjdCcpIHtcbiAgICB0aGlzLl9jb25uZWN0T3ZlcnJpZGUgPSBjb25uZWN0T3ZlcnJpZGU7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5fY29ubmVjdE92ZXJyaWRlID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5SZXF1ZXN0LnByb3RvdHlwZS50cnVzdExvY2FsaG9zdCA9IGZ1bmN0aW9uICh0b2dnbGUpIHtcbiAgdGhpcy5fdHJ1c3RMb2NhbGhvc3QgPSB0b2dnbGUgPT09IHVuZGVmaW5lZCA/IHRydWUgOiB0b2dnbGU7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLy8gZ2VuZXJhdGUgSFRUUCB2ZXJiIG1ldGhvZHNcbmlmICghbWV0aG9kcy5pbmNsdWRlcygnZGVsJykpIHtcbiAgLy8gY3JlYXRlIGEgY29weSBzbyB3ZSBkb24ndCBjYXVzZSBjb25mbGljdHMgd2l0aFxuICAvLyBvdGhlciBwYWNrYWdlcyB1c2luZyB0aGUgbWV0aG9kcyBwYWNrYWdlIGFuZFxuICAvLyBucG0gMy54XG4gIG1ldGhvZHMgPSBbLi4ubWV0aG9kc107XG4gIG1ldGhvZHMucHVzaCgnZGVsJyk7XG59XG5cbmZvciAobGV0IG1ldGhvZCBvZiBtZXRob2RzKSB7XG4gIGNvbnN0IG5hbWUgPSBtZXRob2Q7XG4gIG1ldGhvZCA9IG1ldGhvZCA9PT0gJ2RlbCcgPyAnZGVsZXRlJyA6IG1ldGhvZDtcblxuICBtZXRob2QgPSBtZXRob2QudG9VcHBlckNhc2UoKTtcbiAgcmVxdWVzdFtuYW1lXSA9ICh1cmwsIGRhdGEsIGZuKSA9PiB7XG4gICAgY29uc3QgcmVxdWVzdF8gPSByZXF1ZXN0KG1ldGhvZCwgdXJsKTtcbiAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGZuID0gZGF0YTtcbiAgICAgIGRhdGEgPSBudWxsO1xuICAgIH1cblxuICAgIGlmIChkYXRhKSB7XG4gICAgICBpZiAobWV0aG9kID09PSAnR0VUJyB8fCBtZXRob2QgPT09ICdIRUFEJykge1xuICAgICAgICByZXF1ZXN0Xy5xdWVyeShkYXRhKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlcXVlc3RfLnNlbmQoZGF0YSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGZuKSByZXF1ZXN0Xy5lbmQoZm4pO1xuICAgIHJldHVybiByZXF1ZXN0XztcbiAgfTtcbn1cblxuLyoqXG4gKiBDaGVjayBpZiBgbWltZWAgaXMgdGV4dCBhbmQgc2hvdWxkIGJlIGJ1ZmZlcmVkLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBtaW1lXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBpc1RleHQobWltZSkge1xuICBjb25zdCBwYXJ0cyA9IG1pbWUuc3BsaXQoJy8nKTtcbiAgbGV0IHR5cGUgPSBwYXJ0c1swXTtcbiAgaWYgKHR5cGUpIHR5cGUgPSB0eXBlLnRvTG93ZXJDYXNlKCkudHJpbSgpO1xuICBsZXQgc3VidHlwZSA9IHBhcnRzWzFdO1xuICBpZiAoc3VidHlwZSkgc3VidHlwZSA9IHN1YnR5cGUudG9Mb3dlckNhc2UoKS50cmltKCk7XG5cbiAgcmV0dXJuIHR5cGUgPT09ICd0ZXh0JyB8fCBzdWJ0eXBlID09PSAneC13d3ctZm9ybS11cmxlbmNvZGVkJztcbn1cblxuLy8gVGhpcyBpcyBub3QgYSBjYXRjaGFsbCwgYnV0IGEgc3RhcnQuIEl0IG1pZ2h0IGJlIHVzZWZ1bFxuLy8gaW4gdGhlIGxvbmcgcnVuIHRvIGhhdmUgZmlsZSB0aGF0IGluY2x1ZGVzIGFsbCBiaW5hcnlcbi8vIGNvbnRlbnQgdHlwZXMgZnJvbSBodHRwczovL3d3dy5pYW5hLm9yZy9hc3NpZ25tZW50cy9tZWRpYS10eXBlcy9tZWRpYS10eXBlcy54aHRtbFxuZnVuY3Rpb24gaXNCaW5hcnkobWltZSkge1xuICBsZXQgW3JlZ2lzdHJ5LCBuYW1lXSA9IG1pbWUuc3BsaXQoJy8nKTtcbiAgaWYgKHJlZ2lzdHJ5KSByZWdpc3RyeSA9IHJlZ2lzdHJ5LnRvTG93ZXJDYXNlKCkudHJpbSgpO1xuICBpZiAobmFtZSkgbmFtZSA9IG5hbWUudG9Mb3dlckNhc2UoKS50cmltKCk7XG4gIHJldHVybiAoXG4gICAgWydhdWRpbycsICdmb250JywgJ2ltYWdlJywgJ3ZpZGVvJ10uaW5jbHVkZXMocmVnaXN0cnkpIHx8XG4gICAgWydneicsICdnemlwJ10uaW5jbHVkZXMobmFtZSlcbiAgKTtcbn1cblxuLyoqXG4gKiBDaGVjayBpZiBgbWltZWAgaXMganNvbiBvciBoYXMgK2pzb24gc3RydWN0dXJlZCBzeW50YXggc3VmZml4LlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBtaW1lXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gaXNKU09OKG1pbWUpIHtcbiAgLy8gc2hvdWxkIG1hdGNoIC9qc29uIG9yICtqc29uXG4gIC8vIGJ1dCBub3QgL2pzb24tc2VxXG4gIHJldHVybiAvWy8rXWpzb24oJHxbXi1cXHddKS9pLnRlc3QobWltZSk7XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgd2Ugc2hvdWxkIGZvbGxvdyB0aGUgcmVkaXJlY3QgYGNvZGVgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBjb2RlXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gaXNSZWRpcmVjdChjb2RlKSB7XG4gIHJldHVybiBbMzAxLCAzMDIsIDMwMywgMzA1LCAzMDcsIDMwOF0uaW5jbHVkZXMoY29kZSk7XG59XG5cbmZ1bmN0aW9uIGhhc05vbkVtcHR5UmVzcG9uc2VDb250ZW50KHJlcykge1xuICBpZiAocmVzLnN0YXR1c0NvZGUgPT09IDIwNCB8fCByZXMuc3RhdHVzQ29kZSA9PT0gMzA0KSB7XG4gICAgLy8gVGhlc2UgYXJlbid0IHN1cHBvc2VkIHRvIGhhdmUgYW55IGJvZHlcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvLyBoZWFkZXIgY29udGVudCBpcyBhIHN0cmluZywgYW5kIGRpc3RpbmN0aW9uIGJldHdlZW4gMCBhbmQgbm8gaW5mb3JtYXRpb24gaXMgY3J1Y2lhbFxuICBpZiAocmVzLmhlYWRlcnNbJ2NvbnRlbnQtbGVuZ3RoJ10gPT09ICcwJykge1xuICAgIC8vIFdlIGtub3cgdGhhdCB0aGUgYm9keSBpcyBlbXB0eSAodW5mb3J0dW5hdGVseSwgdGhpcyBjaGVjayBkb2VzIG5vdCBjb3ZlciBjaHVua2VkIGVuY29kaW5nKVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuIl0sIm1hcHBpbmdzIjoiOztBQUFBO0FBQ0E7QUFDQTs7QUFFQSxNQUFNO0VBQUVBO0FBQU8sQ0FBQyxHQUFHQyxPQUFPLENBQUMsVUFBVSxDQUFDO0FBQ3RDLE1BQU1DLE1BQU0sR0FBR0QsT0FBTyxDQUFDLGFBQWEsQ0FBQztBQUNyQyxNQUFNRSxLQUFLLEdBQUdGLE9BQU8sQ0FBQyxZQUFZLENBQUM7QUFDbkMsTUFBTUcsSUFBSSxHQUFHSCxPQUFPLENBQUMsV0FBVyxDQUFDO0FBQ2pDLE1BQU1JLEVBQUUsR0FBR0osT0FBTyxDQUFDLFNBQVMsQ0FBQztBQUM3QixNQUFNSyxJQUFJLEdBQUdMLE9BQU8sQ0FBQyxXQUFXLENBQUM7QUFDakMsTUFBTU0sSUFBSSxHQUFHTixPQUFPLENBQUMsV0FBVyxDQUFDO0FBQ2pDLE1BQU1PLEVBQUUsR0FBR1AsT0FBTyxDQUFDLElBQUksQ0FBQztBQUN4QixNQUFNUSxJQUFJLEdBQUdSLE9BQU8sQ0FBQyxNQUFNLENBQUM7QUFDNUIsSUFBSVMsT0FBTyxHQUFHVCxPQUFPLENBQUMsU0FBUyxDQUFDO0FBQ2hDLE1BQU1VLFFBQVEsR0FBR1YsT0FBTyxDQUFDLFdBQVcsQ0FBQztBQUNyQyxNQUFNVyxVQUFVLEdBQUdYLE9BQU8sQ0FBQyxZQUFZLENBQUM7QUFDeEMsTUFBTVksS0FBSyxHQUFHWixPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsWUFBWSxDQUFDO0FBQzVDLE1BQU1hLFNBQVMsR0FBR2IsT0FBTyxDQUFDLFdBQVcsQ0FBQztBQUN0QyxNQUFNYyxhQUFhLEdBQUdkLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQztBQUVwRCxNQUFNZSxLQUFLLEdBQUdmLE9BQU8sQ0FBQyxVQUFVLENBQUM7QUFDakMsTUFBTWdCLFdBQVcsR0FBR2hCLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQztB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QUVuRCxPQUFPNUgsSUFBSSxLQUFLLE1BQU0sSUFBSXNMLE9BQU8sS0FBSyx1QkFBdUI7QUFDL0Q7O0FBRUE7QUFDQTtBQUNBO0FBQ0EsU0FBU3hDLFFBQVFBLENBQUN0UixJQUFJLEVBQUU7RUFDdEIsSUFBSSxDQUFDK1QsUUFBUSxFQUFFSixJQUFJLENBQUMsR0FBRzNULElBQUksQ0FBQ2lOLEtBQUssQ0FBQyxHQUFHLENBQUM7RUFDdEMsSUFBSThHLFFBQVEsRUFBRUEsUUFBUSxHQUFHQSxRQUFRLENBQUM1RCxXQUFXLENBQUMsQ0FBQyxDQUFDQyxJQUFJLENBQUMsQ0FBQztFQUN0RCxJQUFJdUQsSUFBSSxFQUFFQSxJQUFJLEdBQUdBLElBQUksQ0FBQ3hELFdBQVcsQ0FBQyxDQUFDLENBQUNDLElBQUksQ0FBQyxDQUFDO0VBQzFDLE9BQ0UsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQzFILFFBQVEsQ0FBQ3FMLFFBQVEsQ0FBQyxJQUN0RCxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQ3JMLFFBQVEsQ0FBQ2lMLElBQUksQ0FBQztBQUVqQzs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQSxTQUFTOUQsTUFBTUEsQ0FBQzdQLElBQUksRUFBRTtFQUNwQjtFQUNBO0VBQ0EsT0FBTyxxQkFBcUIsQ0FBQ2dOLElBQUksQ0FBQ2hOLElBQUksQ0FBQztBQUN6Qzs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQSxTQUFTd0osVUFBVUEsQ0FBQ1EsSUFBSSxFQUFFO0VBQ3hCLE9BQU8sQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDdEIsUUFBUSxDQUFDc0IsSUFBSSxDQUFDO0FBQ3REO0FBRUEsU0FBU3NKLDBCQUEwQkEsQ0FBQ25LLEdBQUcsRUFBRTtFQUN2QyxJQUFJQSxHQUFHLENBQUNNLFVBQVUsS0FBSyxHQUFHLElBQUlOLEdBQUcsQ0FBQ00sVUFBVSxLQUFLLEdBQUcsRUFBRTtJQUNwRDtJQUNBLE9BQU8sS0FBSztFQUNkOztFQUVBO0VBQ0EsSUFBSU4sR0FBRyxDQUFDZSxPQUFPLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxHQUFHLEVBQUU7SUFDekM7SUFDQSxPQUFPLEtBQUs7RUFDZDtFQUVBLE9BQU8sSUFBSTtBQUNiIiwiaWdub3JlTGlzdCI6W119