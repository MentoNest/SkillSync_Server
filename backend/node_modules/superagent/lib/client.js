"use strict";

/**
 * Root reference for iframes.
 */

let root;
if (typeof window !== 'undefined') {
  // Browser window
  root = window;
} else if (typeof self === 'undefined') {
  // Other environments
  console.warn('Using browser-only version of superagent in non-browser environment');
  root = void 0;
} else {
  // Web Worker
  root = self;
}
const Emitter = require('component-emitter');
const safeStringify = require('fast-safe-stringify');
const qs = require('qs');
const RequestBase = require('./request-base');
const {
  isObject,
  mixin,
  hasOwn,
  isSafeKey
} = require('./utils');
const ResponseBase = require('./response-base');
const Agent = require('./agent-base');

/**
 * Noop.
 */

function noop() {}

/**
 * Expose `request`.
 */

module.exports = function (method, url) {
  // callback
  if (typeof url === 'function') {
    return new exports.Request('GET', method).end(url);
  }

  // url first
  if (arguments.length === 1) {
    return new exports.Request('GET', method);
  }
  return new exports.Request(method, url);
};
exports = module.exports;
const request = exports;
exports.Request = Request;

/**
 * Determine XHR.
 */

request.getXHR = () => {
  if (root.XMLHttpRequest) {
    return new root.XMLHttpRequest();
  }
  throw new Error('Browser-only version of superagent could not find XHR');
};

/**
 * Removes leading and trailing whitespace, added to support IE.
 *
 * @param {String} s
 * @return {String}
 * @api private
 */

const trim = ''.trim ? s => s.trim() : s => s.replace(/(^\s*|\s*$)/g, '');

/**
 * Serialize the given `obj`.
 *
 * @param {Object} obj
 * @return {String}
 * @api private
 */

function serialize(object) {
  if (!isObject(object)) return object;
  const pairs = [];
  for (const key in object) {
    if (hasOwn(object, key)) pushEncodedKeyValuePair(pairs, key, object[key]);
  }
  return pairs.join('&');
}

/**
 * Helps 'serialize' with serializing arrays.
 * Mutates the pairs array.
 *
 * @param {Array} pairs
 * @param {String} key
 * @param {Mixed} val
 */

function pushEncodedKeyValuePair(pairs, key, value) {
  if (value === undefined) return;
  if (value === null) {
    pairs.push(encodeURI(key));
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      pushEncodedKeyValuePair(pairs, key, v);
    }
  } else if (isObject(value)) {
    for (const subkey in value) {
      if (hasOwn(value, subkey)) pushEncodedKeyValuePair(pairs, `${key}[${subkey}]`, value[subkey]);
    }
  } else {
    pairs.push(encodeURI(key) + '=' + encodeURIComponent(value));
  }
}

/**
 * Expose serialization method.
 */

request.serializeObject = serialize;

/**
 * Parse the given x-www-form-urlencoded `str`.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function parseString(string_) {
  const object = {};
  const pairs = string_.split('&');
  let pair;
  let pos;
  for (let i = 0, length_ = pairs.length; i < length_; ++i) {
    pair = pairs[i];
    pos = pair.indexOf('=');
    if (pos === -1) {
      object[decodeURIComponent(pair)] = '';
    } else {
      object[decodeURIComponent(pair.slice(0, pos))] = decodeURIComponent(pair.slice(pos + 1));
    }
  }
  return object;
}

/**
 * Expose parser.
 */

request.parseString = parseString;

/**
 * Default MIME type map.
 *
 *     superagent.types.xml = 'application/xml';
 *
 */

request.types = {
  html: 'text/html',
  json: 'application/json',
  xml: 'text/xml',
  urlencoded: 'application/x-www-form-urlencoded',
  form: 'application/x-www-form-urlencoded',
  'form-data': 'application/x-www-form-urlencoded'
};

/**
 * Map a short type name through `request.types`, falling back to the name
 * itself. Only own entries count: a name such as "constructor" must not
 * resolve to an inherited function.
 *
 * @param {String} type
 * @return {String}
 * @api private
 */

function lookupType(type) {
  return hasOwn(request.types, type) && request.types[type] || type;
}

/**
 * Default serialization map.
 *
 *     superagent.serialize['application/xml'] = function(obj){
 *       return 'generated xml here';
 *     };
 *
 */

request.serialize = {
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
 *     superagent.parse['application/xml'] = function(str){
 *       return { object parsed from str };
 *     };
 *
 */

request.parse = {
  'application/x-www-form-urlencoded': parseString,
  'application/json': JSON.parse
};

/**
 * Parse the given header `str` into
 * an object containing the mapped fields.
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function parseHeader(string_) {
  const lines = string_.split(/\r?\n/);
  const fields = {};
  let index;
  let line;
  let field;
  let value;
  for (let i = 0, length_ = lines.length; i < length_; ++i) {
    line = lines[i];
    index = line.indexOf(':');
    if (index === -1) {
      // could be empty line, just skip it
      continue;
    }
    field = line.slice(0, index).toLowerCase();
    if (!isSafeKey(field)) continue;
    value = trim(line.slice(index + 1));
    fields[field] = value;
  }
  return fields;
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
 * Initialize a new `Response` with the given `xhr`.
 *
 *  - set flags (.ok, .error, etc)
 *  - parse header
 *
 * Examples:
 *
 *  Aliasing `superagent` as `request` is nice:
 *
 *      request = superagent;
 *
 *  We can use the promise-like API, or pass callbacks:
 *
 *      request.get('/').end(function(res){});
 *      request.get('/', function(res){});
 *
 *  Sending data can be chained:
 *
 *      request
 *        .post('/user')
 *        .send({ name: 'tj' })
 *        .end(function(res){});
 *
 *  Or passed to `.send()`:
 *
 *      request
 *        .post('/user')
 *        .send({ name: 'tj' }, function(res){});
 *
 *  Or passed to `.post()`:
 *
 *      request
 *        .post('/user', { name: 'tj' })
 *        .end(function(res){});
 *
 * Or further reduced to a single call for simple cases:
 *
 *      request
 *        .post('/user', { name: 'tj' }, function(res){});
 *
 * @param {XMLHTTPRequest} xhr
 * @param {Object} options
 * @api private
 */

function Response(request_) {
  this.req = request_;
  this.xhr = this.req.xhr;
  // responseText is accessible only if responseType is '' or 'text' and on older browsers
  this.text = this.req.method !== 'HEAD' && (this.xhr.responseType === '' || this.xhr.responseType === 'text') || typeof this.xhr.responseType === 'undefined' ? this.xhr.responseText : null;
  this.statusText = this.req.xhr.statusText;
  let {
    status
  } = this.xhr;
  // handle IE9 bug: http://stackoverflow.com/questions/10046972/msie-returns-status-code-of-1223-for-ajax-request
  if (status === 1223) {
    status = 204;
  }
  this._setStatusProperties(status);
  this.headers = parseHeader(this.xhr.getAllResponseHeaders());
  this.header = this.headers;
  // getAllResponseHeaders sometimes falsely returns "" for CORS requests, but
  // getResponseHeader still works. so we get content-type even if getting
  // other headers fails.
  this.header['content-type'] = this.xhr.getResponseHeader('content-type');
  this._setHeaderProperties(this.header);
  if (this.text === null && request_._responseType) {
    this.body = this.xhr.response;
  } else if (this.req.method === 'HEAD') {
    this.body = null;
  } else {
    this.body = this._parseBody(this.text || this.xhr.response);
  }
}
mixin(Response.prototype, ResponseBase.prototype);

/**
 * Parse the given body `str`.
 *
 * Used for auto-parsing of bodies. Parsers
 * are defined on the `superagent.parse` object.
 *
 * @param {String} str
 * @return {Mixed}
 * @api private
 */

Response.prototype._parseBody = function (string_) {
  // `this.type` is taken from the response; an inherited key such as
  // "constructor" must not resolve to a parser
  let parse = hasOwn(request.parse, this.type) ? request.parse[this.type] : undefined;
  if (this.req._parser) {
    return this.req._parser(this, string_);
  }
  if (!parse && isJSON(this.type)) {
    parse = request.parse['application/json'];
  }
  return parse && string_ && (string_.length > 0 || string_ instanceof Object) ? parse(string_) : null;
};

/**
 * Return an `Error` representative of this response.
 *
 * @return {Error}
 * @api public
 */

Response.prototype.toError = function () {
  const {
    req
  } = this;
  const {
    method
  } = req;
  const {
    url
  } = req;
  const message = `cannot ${method} ${url} (${this.status})`;
  const error = new Error(message);
  error.status = this.status;
  error.method = method;
  error.url = url;
  return error;
};

/**
 * Expose `Response`.
 */

request.Response = Response;

/**
 * Initialize a new `Request` with the given `method` and `url`.
 *
 * @param {String} method
 * @param {String} url
 * @api public
 */

function Request(method, url) {
  const self = this;
  this._query = this._query || [];
  this.method = method;
  this.url = url;
  this.header = {}; // preserves header name case
  this._header = {}; // coerces header names to lowercase
  this.on('end', () => {
    let error = null;
    let res = null;
    try {
      res = new Response(self);
    } catch (err) {
      error = new Error('Parser is unable to parse the response');
      error.parse = true;
      error.original = err;
      // issue #675: return the raw response if the response parsing fails
      if (self.xhr) {
        // ie9 doesn't have 'response' property
        error.rawResponse = typeof self.xhr.responseType === 'undefined' ? self.xhr.responseText : self.xhr.response;
        // issue #876: return the http status code if the response parsing fails
        error.status = self.xhr.status || null;
        error.statusCode = error.status; // backwards-compat only
      } else {
        error.rawResponse = null;
        error.status = null;
      }
      return self.callback(error);
    }
    self.emit('response', res);
    let new_error;
    try {
      if (!self._isResponseOK(res)) {
        new_error = new Error(res.statusText || res.text || 'Unsuccessful HTTP response');
      }
    } catch (err) {
      new_error = err; // ok() callback can throw
    }

    // #1000 don't catch errors from the callback to avoid double calling it
    if (new_error) {
      new_error.original = error;
      new_error.response = res;
      new_error.status = new_error.status || res.status;
      self.callback(new_error, res);
    } else {
      self.callback(null, res);
    }
  });
}

/**
 * Mixin `Emitter` and `RequestBase`.
 */

// eslint-disable-next-line new-cap
Emitter(Request.prototype);
mixin(Request.prototype, RequestBase.prototype);

/**
 * Set Content-Type to `type`, mapping values from `request.types`.
 *
 * Examples:
 *
 *      superagent.types.xml = 'application/xml';
 *
 *      request.post('/')
 *        .type('xml')
 *        .send(xmlstring)
 *        .end(callback);
 *
 *      request.post('/')
 *        .type('application/xml')
 *        .send(xmlstring)
 *        .end(callback);
 *
 * @param {String} type
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.type = function (type) {
  this.set('Content-Type', lookupType(type));
  return this;
};

/**
 * Set Accept to `type`, mapping values from `request.types`.
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
  this.set('Accept', lookupType(type));
  return this;
};

/**
 * Set Authorization field value with `user` and `pass`.
 *
 * @param {String} user
 * @param {String} [pass] optional in case of using 'bearer' as type
 * @param {Object} options with 'type' property 'auto', 'basic' or 'bearer' (default 'basic')
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
      type: typeof btoa === 'function' ? 'basic' : 'auto'
    };
  }
  let {
    encoder
  } = options;
  if (!encoder) {
    encoder = string => {
      if (typeof btoa === 'function') {
        return btoa(string);
      }
      throw new Error('Cannot use basic auth, btoa is not a function');
    };
  }
  return this._auth(user, pass, options, encoder);
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
  if (typeof value !== 'string') value = serialize(value);
  if (value) this._query.push(value);
  return this;
};

/**
 * Queue the given `file` as an attachment to the specified `field`,
 * with optional `options` (or filename).
 *
 * ``` js
 * request.post('/upload')
 *   .attach('content', new Blob(['<a id="a"><b id="b">hey!</b></a>'], { type: "text/html"}))
 *   .end(callback);
 * ```
 *
 * @param {String} field
 * @param {Blob|File} file
 * @param {String|Object} options
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.attach = function (field, file, options) {
  if (file) {
    if (this._data) {
      throw new Error("superagent can't mix .send() and .attach()");
    }
    this._getFormData().append(field, file, options || file.name);
  }
  return this;
};
Request.prototype._getFormData = function () {
  if (!this._formData) {
    this._formData = new root.FormData();
  }
  return this._formData;
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
  const fn = this._callback;
  this.clearTimeout();
  if (error) {
    if (this._maxRetries) error.retries = this._retries - 1;
    this.emit('error', error);
  }
  fn(error, res);
};

/**
 * Invoke callback with x-domain error.
 *
 * @api private
 */

Request.prototype.crossDomainError = function () {
  const error = new Error('Request has been terminated\nPossible causes: the network is offline, Origin is not allowed by Access-Control-Allow-Origin, the page is being unloaded, etc.');
  error.crossDomain = true;
  error.status = this.status;
  error.method = this.method;
  error.url = this.url;
  this.callback(error);
};

// This only warns, because the request is still likely to work
Request.prototype.agent = function () {
  console.warn('This is not supported in browser version of superagent');
  return this;
};
Request.prototype.ca = Request.prototype.agent;
Request.prototype.buffer = Request.prototype.ca;

// This throws, because it can't send/receive data as expected
Request.prototype.write = () => {
  throw new Error('Streaming is not supported in browser version of superagent');
};
Request.prototype.pipe = Request.prototype.write;

/**
 * Check if `obj` is a host object,
 * we don't want to serialize these :)
 *
 * @param {Object} obj host object
 * @return {Boolean} is a host object
 * @api private
 */
Request.prototype._isHost = function (object) {
  // Native objects stringify to [object File], [object Blob], [object FormData], etc.
  return object && typeof object === 'object' && !Array.isArray(object) && Object.prototype.toString.call(object) !== '[object Object]';
};

/**
 * Initiate request, invoking callback `fn(res)`
 * with an instanceof `Response`.
 *
 * @param {Function} fn
 * @return {Request} for chaining
 * @api public
 */

Request.prototype.end = function (fn) {
  if (this._endCalled) {
    console.warn('Warning: .end() was called twice. This is not supported in superagent');
  }
  this._endCalled = true;

  // store callback
  this._callback = fn || noop;

  // querystring
  this._finalizeQueryString();
  this._end();
};
Request.prototype._setUploadTimeout = function () {
  const self = this;

  // upload timeout it's wokrs only if deadline timeout is off
  if (this._uploadTimeout && !this._uploadTimeoutTimer) {
    this._uploadTimeoutTimer = setTimeout(() => {
      self._timeoutError('Upload timeout of ', self._uploadTimeout, 'ETIMEDOUT');
    }, this._uploadTimeout);
  }
};

// eslint-disable-next-line complexity
Request.prototype._end = function () {
  if (this._aborted) return this.callback(new Error('The request has been aborted even before .end() was called'));
  const self = this;
  this.xhr = request.getXHR();
  const {
    xhr
  } = this;
  let data = this._formData || this._data;
  this._setTimeouts();

  // state change
  xhr.addEventListener('readystatechange', () => {
    const {
      readyState
    } = xhr;
    if (readyState >= 2 && self._responseTimeoutTimer) {
      clearTimeout(self._responseTimeoutTimer);
    }
    if (readyState !== 4) {
      return;
    }

    // In IE9, reads to any property (e.g. status) off of an aborted XHR will
    // result in the error "Could not complete the operation due to error c00c023f"
    let status;
    try {
      status = xhr.status;
    } catch (err) {
      status = 0;
    }
    if (!status) {
      if (self.timedout || self._aborted) return;
      return self.crossDomainError();
    }
    self.emit('end');
  });

  // progress
  const handleProgress = (direction, e) => {
    if (e.total > 0) {
      e.percent = e.loaded / e.total * 100;
      if (e.percent === 100) {
        clearTimeout(self._uploadTimeoutTimer);
      }
    }
    e.direction = direction;
    self.emit('progress', e);
  };
  if (this.hasListeners('progress')) {
    try {
      xhr.addEventListener('progress', handleProgress.bind(null, 'download'));
      if (xhr.upload) {
        xhr.upload.addEventListener('progress', handleProgress.bind(null, 'upload'));
      }
    } catch (err) {
      // Accessing xhr.upload fails in IE from a web worker, so just pretend it doesn't exist.
      // Reported here:
      // https://connect.microsoft.com/IE/feedback/details/837245/xmlhttprequest-upload-throws-invalid-argument-when-used-from-web-worker-context
    }
  }
  if (xhr.upload) {
    this._setUploadTimeout();
  }

  // initiate request
  try {
    if (this.username && this.password) {
      xhr.open(this.method, this.url, true, this.username, this.password);
    } else {
      xhr.open(this.method, this.url, true);
    }
  } catch (err) {
    // see #1149
    return this.callback(err);
  }

  // CORS
  if (this._withCredentials) xhr.withCredentials = true;

  // body
  if (!this._formData && this.method !== 'GET' && this.method !== 'HEAD' && typeof data !== 'string' && !this._isHost(data)) {
    // serialize stuff
    const contentType = this._header['content-type'];
    const serializeType = contentType ? contentType.split(';')[0] : '';
    let serialize = this._serializer || (hasOwn(request.serialize, serializeType) ? request.serialize[serializeType] : undefined);
    if (!serialize && isJSON(contentType)) {
      serialize = request.serialize['application/json'];
    }
    if (serialize) data = serialize(data);
  }

  // set header fields
  try {
    for (const field in this.header) {
      if (this.header[field] === null) continue;
      if (hasOwn(this.header, field)) xhr.setRequestHeader(field, this.header[field]);
    }
    if (this._responseType) {
      xhr.responseType = this._responseType;
    }

    // send stuff
    this.emit('request', this);

    // IE11 xhr.send(undefined) sends 'undefined' string as POST payload (instead of nothing)
    // We need null here if data is undefined
    xhr.send(typeof data === 'undefined' ? null : data);
  } catch (err) {
    try {
      xhr.abort();
    } catch (err) {
      // ignore
    }
    return this.callback(err);
  }
};

// create a Proxy that can instantiate a new Agent without using `new` keyword
// (for backward compatibility and chaining)
const proxyAgent = new Proxy(Agent, {
  apply(target, thisArg, argumentsList) {
    // eslint-disable-next-line new-cap
    return new target(...argumentsList);
  }
});
request.agent = proxyAgent;
for (const method of ['GET', 'HEAD', 'POST', 'OPTIONS', 'PATCH', 'PUT', 'DELETE']) {
  Agent.prototype[method.toLowerCase()] = function (url, fn) {
    const request_ = new request.Request(method, url);
    this._setDefaults(request_);
    if (fn) {
      request_.end(fn);
    }
    return request_;
  };
}
Agent.prototype.del = Agent.prototype.delete;

/**
 * GET `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} [data] or fn
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */

request.get = (url, data, fn) => {
  const request_ = request('GET', url);
  if (typeof data === 'function') {
    fn = data;
    data = null;
  }
  if (data) request_.query(data);
  if (fn) request_.end(fn);
  return request_;
};

/**
 * HEAD `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} [data] or fn
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */

request.head = (url, data, fn) => {
  const request_ = request('HEAD', url);
  if (typeof data === 'function') {
    fn = data;
    data = null;
  }
  if (data) request_.query(data);
  if (fn) request_.end(fn);
  return request_;
};

/**
 * OPTIONS query to `url` with optional callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} [data] or fn
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */

request.options = (url, data, fn) => {
  const request_ = request('OPTIONS', url);
  if (typeof data === 'function') {
    fn = data;
    data = null;
  }
  if (data) request_.send(data);
  if (fn) request_.end(fn);
  return request_;
};

/**
 * DELETE `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed} [data]
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */

function del(url, data, fn) {
  const request_ = request('DELETE', url);
  if (typeof data === 'function') {
    fn = data;
    data = null;
  }
  if (data) request_.send(data);
  if (fn) request_.end(fn);
  return request_;
}
request.del = del;
request.delete = del;

/**
 * PATCH `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed} [data]
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */

request.patch = (url, data, fn) => {
  const request_ = request('PATCH', url);
  if (typeof data === 'function') {
    fn = data;
    data = null;
  }
  if (data) request_.send(data);
  if (fn) request_.end(fn);
  return request_;
};

/**
 * POST `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed} [data]
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */

request.post = (url, data, fn) => {
  const request_ = request('POST', url);
  if (typeof data === 'function') {
    fn = data;
    data = null;
  }
  if (data) request_.send(data);
  if (fn) request_.end(fn);
  return request_;
};

/**
 * PUT `url` with optional `data` and callback `fn(res)`.
 *
 * @param {String} url
 * @param {Mixed|Function} [data] or fn
 * @param {Function} [fn]
 * @return {Request}
 * @api public
 */

request.put = (url, data, fn) => {
  const request_ = request('PUT', url);
  if (typeof data === 'function') {
    fn = data;
    data = null;
  }
  if (data) request_.send(data);
  if (fn) request_.end(fn);
  return request_;
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJyb290Iiwid2luZG93Iiwic2VsZiIsImNvbnNvbGUiLCJ3YXJuIiwiRW1pdHRlciIsInJlcXVpcmUiLCJzYWZlU3RyaW5naWZ5IiwicXMiLCJSZXF1ZXN0QmFzZSIsImlzT2JqZWN0IiwibWl4aW4iLCJoYXNPd24iLCJpc1NhZmVLZXkiLCJSZXNwb25zZUJhc2UiLCJBZ2VudCIsIm5vb3AiLCJtb2R1bGUiLCJleHBvcnRzIiwibWV0aG9kIiwidXJsIiwiUmVxdWVzdCIsImVuZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsInJlcXVlc3QiLCJnZXRYSFIiLCJYTUxIdHRwUmVxdWVzdCIsIkVycm9yIiwidHJpbSIsInMiLCJyZXBsYWNlIiwic2VyaWFsaXplIiwib2JqZWN0IiwicGFpcnMiLCJrZXkiLCJwdXNoRW5jb2RlZEtleVZhbHVlUGFpciIsImpvaW4iLCJ2YWx1ZSIsInVuZGVmaW5lZCIsInB1c2giLCJlbmNvZGVVUkkiLCJBcnJheSIsImlzQXJyYXkiLCJ2Iiwic3Via2V5IiwiZW5jb2RlVVJJQ29tcG9uZW50Iiwic2VyaWFsaXplT2JqZWN0IiwicGFyc2VTdHJpbmciLCJzdHJpbmdfIiwic3BsaXQiLCJwYWlyIiwicG9zIiwiaSIsImxlbmd0aF8iLCJpbmRleE9mIiwiZGVjb2RlVVJJQ29tcG9uZW50Iiwic2xpY2UiLCJ0eXBlcyIsImh0bWwiLCJqc29uIiwieG1sIiwidXJsZW5jb2RlZCIsImZvcm0iLCJsb29rdXBUeXBlIiwidHlwZSIsImFwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCIsInN0cmluZ2lmeSIsImluZGljZXMiLCJzdHJpY3ROdWxsSGFuZGxpbmciLCJwYXJzZSIsIkpTT04iLCJwYXJzZUhlYWRlciIsImxpbmVzIiwiZmllbGRzIiwiaW5kZXgiLCJsaW5lIiwiZmllbGQiLCJ0b0xvd2VyQ2FzZSIsImlzSlNPTiIsIm1pbWUiLCJ0ZXN0IiwiUmVzcG9uc2UiLCJyZXF1ZXN0XyIsInJlcSIsInhociIsInRleHQiLCJyZXNwb25zZVR5cGUiLCJyZXNwb25zZVRleHQiLCJzdGF0dXNUZXh0Iiwic3RhdHVzIiwiX3NldFN0YXR1c1Byb3BlcnRpZXMiLCJoZWFkZXJzIiwiZ2V0QWxsUmVzcG9uc2VIZWFkZXJzIiwiaGVhZGVyIiwiZ2V0UmVzcG9uc2VIZWFkZXIiLCJfc2V0SGVhZGVyUHJvcGVydGllcyIsIl9yZXNwb25zZVR5cGUiLCJib2R5IiwicmVzcG9uc2UiLCJfcGFyc2VCb2R5IiwicHJvdG90eXBlIiwiX3BhcnNlciIsIk9iamVjdCIsInRvRXJyb3IiLCJtZXNzYWdlIiwiZXJyb3IiLCJfcXVlcnkiLCJfaGVhZGVyIiwib24iLCJyZXMiLCJlcnIiLCJvcmlnaW5hbCIsInJhd1Jlc3BvbnNlIiwic3RhdHVzQ29kZSIsImNhbGxiYWNrIiwiZW1pdCIsIm5ld19lcnJvciIsIl9pc1Jlc3BvbnNlT0siLCJzZXQiLCJhY2NlcHQiLCJhdXRoIiwidXNlciIsInBhc3MiLCJvcHRpb25zIiwiYnRvYSIsImVuY29kZXIiLCJzdHJpbmciLCJfYXV0aCIsInF1ZXJ5IiwiYXR0YWNoIiwiZmlsZSIsIl9kYXRhIiwiX2dldEZvcm1EYXRhIiwiYXBwZW5kIiwibmFtZSIsIl9mb3JtRGF0YSIsIkZvcm1EYXRhIiwiX3Nob3VsZFJldHJ5IiwiX3JldHJ5IiwiZm4iLCJfY2FsbGJhY2siLCJjbGVhclRpbWVvdXQiLCJfbWF4UmV0cmllcyIsInJldHJpZXMiLCJfcmV0cmllcyIsImNyb3NzRG9tYWluRXJyb3IiLCJjcm9zc0RvbWFpbiIsImFnZW50IiwiY2EiLCJidWZmZXIiLCJ3cml0ZSIsInBpcGUiLCJfaXNIb3N0IiwidG9TdHJpbmciLCJjYWxsIiwiX2VuZENhbGxlZCIsIl9maW5hbGl6ZVF1ZXJ5U3RyaW5nIiwiX2VuZCIsIl9zZXRVcGxvYWRUaW1lb3V0IiwiX3VwbG9hZFRpbWVvdXQiLCJfdXBsb2FkVGltZW91dFRpbWVyIiwic2V0VGltZW91dCIsIl90aW1lb3V0RXJyb3IiLCJfYWJvcnRlZCIsImRhdGEiLCJfc2V0VGltZW91dHMiLCJhZGRFdmVudExpc3RlbmVyIiwicmVhZHlTdGF0ZSIsIl9yZXNwb25zZVRpbWVvdXRUaW1lciIsInRpbWVkb3V0IiwiaGFuZGxlUHJvZ3Jlc3MiLCJkaXJlY3Rpb24iLCJlIiwidG90YWwiLCJwZXJjZW50IiwibG9hZGVkIiwiaGFzTGlzdGVuZXJzIiwiYmluZCIsInVwbG9hZCIsInVzZXJuYW1lIiwicGFzc3dvcmQiLCJvcGVuIiwiX3dpdGhDcmVkZW50aWFscyIsIndpdGhDcmVkZW50aWFscyIsImNvbnRlbnRUeXBlIiwic2VyaWFsaXplVHlwZSIsIl9zZXJpYWxpemVyIiwic2V0UmVxdWVzdEhlYWRlciIsInNlbmQiLCJhYm9ydCIsInByb3h5QWdlbnQiLCJQcm94eSIsImFwcGx5IiwidGFyZ2V0IiwidGhpc0FyZyIsImFyZ3VtZW50c0xpc3QiLCJfc2V0RGVmYXVsdHMiLCJkZWwiLCJkZWxldGUiLCJnZXQiLCJoZWFkIiwicGF0Y2giLCJwb3N0IiwicHV0Il0sInNvdXJjZXMiOlsiLi4vc3JjL2NsaWVudC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFJvb3QgcmVmZXJlbmNlIGZvciBpZnJhbWVzLlxuICovXG5cbmxldCByb290O1xuaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG4gIC8vIEJyb3dzZXIgd2luZG93XG4gIHJvb3QgPSB3aW5kb3c7XG59IGVsc2UgaWYgKHR5cGVvZiBzZWxmID09PSAndW5kZWZpbmVkJykge1xuICAvLyBPdGhlciBlbnZpcm9ubWVudHNcbiAgY29uc29sZS53YXJuKFxuICAgICdVc2luZyBicm93c2VyLW9ubHkgdmVyc2lvbiBvZiBzdXBlcmFnZW50IGluIG5vbi1icm93c2VyIGVudmlyb25tZW50J1xuICApO1xuICByb290ID0gdGhpcztcbn0gZWxzZSB7XG4gIC8vIFdlYiBXb3JrZXJcbiAgcm9vdCA9IHNlbGY7XG59XG5cbmNvbnN0IEVtaXR0ZXIgPSByZXF1aXJlKCdjb21wb25lbnQtZW1pdHRlcicpO1xuY29uc3Qgc2FmZVN0cmluZ2lmeSA9IHJlcXVpcmUoJ2Zhc3Qtc2FmZS1zdHJpbmdpZnknKTtcbmNvbnN0IHFzID0gcmVxdWlyZSgncXMnKTtcbmNvbnN0IFJlcXVlc3RCYXNlID0gcmVxdWlyZSgnLi9yZXF1ZXN0LWJhc2UnKTtcbmNvbnN0IHsgaXNPYmplY3QsIG1peGluLCBoYXNPd24sIGlzU2FmZUtleSB9ID0gcmVxdWlyZSgnLi91dGlscycpO1xuY29uc3QgUmVzcG9uc2VCYXNlID0gcmVxdWlyZSgnLi9yZXNwb25zZS1iYXNlJyk7XG5jb25zdCBBZ2VudCA9IHJlcXVpcmUoJy4vYWdlbnQtYmFzZScpO1xuXG4vKipcbiAqIE5vb3AuXG4gKi9cblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbi8qKlxuICogRXhwb3NlIGByZXF1ZXN0YC5cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChtZXRob2QsIHVybCkge1xuICAvLyBjYWxsYmFja1xuICBpZiAodHlwZW9mIHVybCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHJldHVybiBuZXcgZXhwb3J0cy5SZXF1ZXN0KCdHRVQnLCBtZXRob2QpLmVuZCh1cmwpO1xuICB9XG5cbiAgLy8gdXJsIGZpcnN0XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIG5ldyBleHBvcnRzLlJlcXVlc3QoJ0dFVCcsIG1ldGhvZCk7XG4gIH1cblxuICByZXR1cm4gbmV3IGV4cG9ydHMuUmVxdWVzdChtZXRob2QsIHVybCk7XG59O1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHM7XG5cbmNvbnN0IHJlcXVlc3QgPSBleHBvcnRzO1xuXG5leHBvcnRzLlJlcXVlc3QgPSBSZXF1ZXN0O1xuXG4vKipcbiAqIERldGVybWluZSBYSFIuXG4gKi9cblxucmVxdWVzdC5nZXRYSFIgPSAoKSA9PiB7XG4gIGlmIChyb290LlhNTEh0dHBSZXF1ZXN0KSB7XG4gICAgcmV0dXJuIG5ldyByb290LlhNTEh0dHBSZXF1ZXN0KCk7XG4gIH1cblxuICB0aHJvdyBuZXcgRXJyb3IoJ0Jyb3dzZXItb25seSB2ZXJzaW9uIG9mIHN1cGVyYWdlbnQgY291bGQgbm90IGZpbmQgWEhSJyk7XG59O1xuXG4vKipcbiAqIFJlbW92ZXMgbGVhZGluZyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZSwgYWRkZWQgdG8gc3VwcG9ydCBJRS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc1xuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuY29uc3QgdHJpbSA9ICcnLnRyaW0gPyAocykgPT4gcy50cmltKCkgOiAocykgPT4gcy5yZXBsYWNlKC8oXlxccyp8XFxzKiQpL2csICcnKTtcblxuLyoqXG4gKiBTZXJpYWxpemUgdGhlIGdpdmVuIGBvYmpgLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmpcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZShvYmplY3QpIHtcbiAgaWYgKCFpc09iamVjdChvYmplY3QpKSByZXR1cm4gb2JqZWN0O1xuICBjb25zdCBwYWlycyA9IFtdO1xuICBmb3IgKGNvbnN0IGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAoaGFzT3duKG9iamVjdCwga2V5KSkgcHVzaEVuY29kZWRLZXlWYWx1ZVBhaXIocGFpcnMsIGtleSwgb2JqZWN0W2tleV0pO1xuICB9XG5cbiAgcmV0dXJuIHBhaXJzLmpvaW4oJyYnKTtcbn1cblxuLyoqXG4gKiBIZWxwcyAnc2VyaWFsaXplJyB3aXRoIHNlcmlhbGl6aW5nIGFycmF5cy5cbiAqIE11dGF0ZXMgdGhlIHBhaXJzIGFycmF5LlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IHBhaXJzXG4gKiBAcGFyYW0ge1N0cmluZ30ga2V5XG4gKiBAcGFyYW0ge01peGVkfSB2YWxcbiAqL1xuXG5mdW5jdGlvbiBwdXNoRW5jb2RlZEtleVZhbHVlUGFpcihwYWlycywga2V5LCB2YWx1ZSkge1xuICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkgcmV0dXJuO1xuICBpZiAodmFsdWUgPT09IG51bGwpIHtcbiAgICBwYWlycy5wdXNoKGVuY29kZVVSSShrZXkpKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICBmb3IgKGNvbnN0IHYgb2YgdmFsdWUpIHtcbiAgICAgIHB1c2hFbmNvZGVkS2V5VmFsdWVQYWlyKHBhaXJzLCBrZXksIHYpO1xuICAgIH1cbiAgfSBlbHNlIGlmIChpc09iamVjdCh2YWx1ZSkpIHtcbiAgICBmb3IgKGNvbnN0IHN1YmtleSBpbiB2YWx1ZSkge1xuICAgICAgaWYgKGhhc093bih2YWx1ZSwgc3Via2V5KSlcbiAgICAgICAgcHVzaEVuY29kZWRLZXlWYWx1ZVBhaXIocGFpcnMsIGAke2tleX1bJHtzdWJrZXl9XWAsIHZhbHVlW3N1YmtleV0pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBwYWlycy5wdXNoKGVuY29kZVVSSShrZXkpICsgJz0nICsgZW5jb2RlVVJJQ29tcG9uZW50KHZhbHVlKSk7XG4gIH1cbn1cblxuLyoqXG4gKiBFeHBvc2Ugc2VyaWFsaXphdGlvbiBtZXRob2QuXG4gKi9cblxucmVxdWVzdC5zZXJpYWxpemVPYmplY3QgPSBzZXJpYWxpemU7XG5cbi8qKlxuICogUGFyc2UgdGhlIGdpdmVuIHgtd3d3LWZvcm0tdXJsZW5jb2RlZCBgc3RyYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBwYXJzZVN0cmluZyhzdHJpbmdfKSB7XG4gIGNvbnN0IG9iamVjdCA9IHt9O1xuICBjb25zdCBwYWlycyA9IHN0cmluZ18uc3BsaXQoJyYnKTtcbiAgbGV0IHBhaXI7XG4gIGxldCBwb3M7XG5cbiAgZm9yIChsZXQgaSA9IDAsIGxlbmd0aF8gPSBwYWlycy5sZW5ndGg7IGkgPCBsZW5ndGhfOyArK2kpIHtcbiAgICBwYWlyID0gcGFpcnNbaV07XG4gICAgcG9zID0gcGFpci5pbmRleE9mKCc9Jyk7XG4gICAgaWYgKHBvcyA9PT0gLTEpIHtcbiAgICAgIG9iamVjdFtkZWNvZGVVUklDb21wb25lbnQocGFpcildID0gJyc7XG4gICAgfSBlbHNlIHtcbiAgICAgIG9iamVjdFtkZWNvZGVVUklDb21wb25lbnQocGFpci5zbGljZSgwLCBwb3MpKV0gPSBkZWNvZGVVUklDb21wb25lbnQoXG4gICAgICAgIHBhaXIuc2xpY2UocG9zICsgMSlcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9iamVjdDtcbn1cblxuLyoqXG4gKiBFeHBvc2UgcGFyc2VyLlxuICovXG5cbnJlcXVlc3QucGFyc2VTdHJpbmcgPSBwYXJzZVN0cmluZztcblxuLyoqXG4gKiBEZWZhdWx0IE1JTUUgdHlwZSBtYXAuXG4gKlxuICogICAgIHN1cGVyYWdlbnQudHlwZXMueG1sID0gJ2FwcGxpY2F0aW9uL3htbCc7XG4gKlxuICovXG5cbnJlcXVlc3QudHlwZXMgPSB7XG4gIGh0bWw6ICd0ZXh0L2h0bWwnLFxuICBqc29uOiAnYXBwbGljYXRpb24vanNvbicsXG4gIHhtbDogJ3RleHQveG1sJyxcbiAgdXJsZW5jb2RlZDogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcsXG4gIGZvcm06ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnLFxuICAnZm9ybS1kYXRhJzogJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCdcbn07XG5cbi8qKlxuICogTWFwIGEgc2hvcnQgdHlwZSBuYW1lIHRocm91Z2ggYHJlcXVlc3QudHlwZXNgLCBmYWxsaW5nIGJhY2sgdG8gdGhlIG5hbWVcbiAqIGl0c2VsZi4gT25seSBvd24gZW50cmllcyBjb3VudDogYSBuYW1lIHN1Y2ggYXMgXCJjb25zdHJ1Y3RvclwiIG11c3Qgbm90XG4gKiByZXNvbHZlIHRvIGFuIGluaGVyaXRlZCBmdW5jdGlvbi5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZVxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gbG9va3VwVHlwZSh0eXBlKSB7XG4gIHJldHVybiAoaGFzT3duKHJlcXVlc3QudHlwZXMsIHR5cGUpICYmIHJlcXVlc3QudHlwZXNbdHlwZV0pIHx8IHR5cGU7XG59XG5cbi8qKlxuICogRGVmYXVsdCBzZXJpYWxpemF0aW9uIG1hcC5cbiAqXG4gKiAgICAgc3VwZXJhZ2VudC5zZXJpYWxpemVbJ2FwcGxpY2F0aW9uL3htbCddID0gZnVuY3Rpb24ob2JqKXtcbiAqICAgICAgIHJldHVybiAnZ2VuZXJhdGVkIHhtbCBoZXJlJztcbiAqICAgICB9O1xuICpcbiAqL1xuXG5yZXF1ZXN0LnNlcmlhbGl6ZSA9IHtcbiAgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcob2JqZWN0KSB7XG4gICAgcmV0dXJuIHFzLnN0cmluZ2lmeShvYmplY3QsIHsgaW5kaWNlczogZmFsc2UsIHN0cmljdE51bGxIYW5kbGluZzogdHJ1ZSB9KTtcbiAgfSxcbiAgJ2FwcGxpY2F0aW9uL2pzb24nOiBzYWZlU3RyaW5naWZ5LFxuICAvLyBDU1AgcmVwb3J0cyBjYXJyeSBKU09OIGJvZGllcyBidXQgdXNlIGEgZGlzdGluY3QgcmVnaXN0ZXJlZCBtZWRpYSB0eXBlLlxuICAnYXBwbGljYXRpb24vY3NwLXJlcG9ydCc6IHNhZmVTdHJpbmdpZnlcbn07XG5cbi8qKlxuICogRGVmYXVsdCBwYXJzZXJzLlxuICpcbiAqICAgICBzdXBlcmFnZW50LnBhcnNlWydhcHBsaWNhdGlvbi94bWwnXSA9IGZ1bmN0aW9uKHN0cil7XG4gKiAgICAgICByZXR1cm4geyBvYmplY3QgcGFyc2VkIGZyb20gc3RyIH07XG4gKiAgICAgfTtcbiAqXG4gKi9cblxucmVxdWVzdC5wYXJzZSA9IHtcbiAgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCc6IHBhcnNlU3RyaW5nLFxuICAnYXBwbGljYXRpb24vanNvbic6IEpTT04ucGFyc2Vcbn07XG5cbi8qKlxuICogUGFyc2UgdGhlIGdpdmVuIGhlYWRlciBgc3RyYCBpbnRvXG4gKiBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgbWFwcGVkIGZpZWxkcy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBwYXJzZUhlYWRlcihzdHJpbmdfKSB7XG4gIGNvbnN0IGxpbmVzID0gc3RyaW5nXy5zcGxpdCgvXFxyP1xcbi8pO1xuICBjb25zdCBmaWVsZHMgPSB7fTtcbiAgbGV0IGluZGV4O1xuICBsZXQgbGluZTtcbiAgbGV0IGZpZWxkO1xuICBsZXQgdmFsdWU7XG5cbiAgZm9yIChsZXQgaSA9IDAsIGxlbmd0aF8gPSBsaW5lcy5sZW5ndGg7IGkgPCBsZW5ndGhfOyArK2kpIHtcbiAgICBsaW5lID0gbGluZXNbaV07XG4gICAgaW5kZXggPSBsaW5lLmluZGV4T2YoJzonKTtcbiAgICBpZiAoaW5kZXggPT09IC0xKSB7XG4gICAgICAvLyBjb3VsZCBiZSBlbXB0eSBsaW5lLCBqdXN0IHNraXAgaXRcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGZpZWxkID0gbGluZS5zbGljZSgwLCBpbmRleCkudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAoIWlzU2FmZUtleShmaWVsZCkpIGNvbnRpbnVlO1xuICAgIHZhbHVlID0gdHJpbShsaW5lLnNsaWNlKGluZGV4ICsgMSkpO1xuICAgIGZpZWxkc1tmaWVsZF0gPSB2YWx1ZTtcbiAgfVxuXG4gIHJldHVybiBmaWVsZHM7XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgYG1pbWVgIGlzIGpzb24gb3IgaGFzICtqc29uIHN0cnVjdHVyZWQgc3ludGF4IHN1ZmZpeC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbWltZVxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGlzSlNPTihtaW1lKSB7XG4gIC8vIHNob3VsZCBtYXRjaCAvanNvbiBvciAranNvblxuICAvLyBidXQgbm90IC9qc29uLXNlcVxuICByZXR1cm4gL1svK11qc29uKCR8W14tXFx3XSkvaS50ZXN0KG1pbWUpO1xufVxuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYFJlc3BvbnNlYCB3aXRoIHRoZSBnaXZlbiBgeGhyYC5cbiAqXG4gKiAgLSBzZXQgZmxhZ3MgKC5vaywgLmVycm9yLCBldGMpXG4gKiAgLSBwYXJzZSBoZWFkZXJcbiAqXG4gKiBFeGFtcGxlczpcbiAqXG4gKiAgQWxpYXNpbmcgYHN1cGVyYWdlbnRgIGFzIGByZXF1ZXN0YCBpcyBuaWNlOlxuICpcbiAqICAgICAgcmVxdWVzdCA9IHN1cGVyYWdlbnQ7XG4gKlxuICogIFdlIGNhbiB1c2UgdGhlIHByb21pc2UtbGlrZSBBUEksIG9yIHBhc3MgY2FsbGJhY2tzOlxuICpcbiAqICAgICAgcmVxdWVzdC5nZXQoJy8nKS5lbmQoZnVuY3Rpb24ocmVzKXt9KTtcbiAqICAgICAgcmVxdWVzdC5nZXQoJy8nLCBmdW5jdGlvbihyZXMpe30pO1xuICpcbiAqICBTZW5kaW5nIGRhdGEgY2FuIGJlIGNoYWluZWQ6XG4gKlxuICogICAgICByZXF1ZXN0XG4gKiAgICAgICAgLnBvc3QoJy91c2VyJylcbiAqICAgICAgICAuc2VuZCh7IG5hbWU6ICd0aicgfSlcbiAqICAgICAgICAuZW5kKGZ1bmN0aW9uKHJlcyl7fSk7XG4gKlxuICogIE9yIHBhc3NlZCB0byBgLnNlbmQoKWA6XG4gKlxuICogICAgICByZXF1ZXN0XG4gKiAgICAgICAgLnBvc3QoJy91c2VyJylcbiAqICAgICAgICAuc2VuZCh7IG5hbWU6ICd0aicgfSwgZnVuY3Rpb24ocmVzKXt9KTtcbiAqXG4gKiAgT3IgcGFzc2VkIHRvIGAucG9zdCgpYDpcbiAqXG4gKiAgICAgIHJlcXVlc3RcbiAqICAgICAgICAucG9zdCgnL3VzZXInLCB7IG5hbWU6ICd0aicgfSlcbiAqICAgICAgICAuZW5kKGZ1bmN0aW9uKHJlcyl7fSk7XG4gKlxuICogT3IgZnVydGhlciByZWR1Y2VkIHRvIGEgc2luZ2xlIGNhbGwgZm9yIHNpbXBsZSBjYXNlczpcbiAqXG4gKiAgICAgIHJlcXVlc3RcbiAqICAgICAgICAucG9zdCgnL3VzZXInLCB7IG5hbWU6ICd0aicgfSwgZnVuY3Rpb24ocmVzKXt9KTtcbiAqXG4gKiBAcGFyYW0ge1hNTEhUVFBSZXF1ZXN0fSB4aHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBSZXNwb25zZShyZXF1ZXN0Xykge1xuICB0aGlzLnJlcSA9IHJlcXVlc3RfO1xuICB0aGlzLnhociA9IHRoaXMucmVxLnhocjtcbiAgLy8gcmVzcG9uc2VUZXh0IGlzIGFjY2Vzc2libGUgb25seSBpZiByZXNwb25zZVR5cGUgaXMgJycgb3IgJ3RleHQnIGFuZCBvbiBvbGRlciBicm93c2Vyc1xuICB0aGlzLnRleHQgPVxuICAgICh0aGlzLnJlcS5tZXRob2QgIT09ICdIRUFEJyAmJlxuICAgICAgKHRoaXMueGhyLnJlc3BvbnNlVHlwZSA9PT0gJycgfHwgdGhpcy54aHIucmVzcG9uc2VUeXBlID09PSAndGV4dCcpKSB8fFxuICAgIHR5cGVvZiB0aGlzLnhoci5yZXNwb25zZVR5cGUgPT09ICd1bmRlZmluZWQnXG4gICAgICA/IHRoaXMueGhyLnJlc3BvbnNlVGV4dFxuICAgICAgOiBudWxsO1xuICB0aGlzLnN0YXR1c1RleHQgPSB0aGlzLnJlcS54aHIuc3RhdHVzVGV4dDtcbiAgbGV0IHsgc3RhdHVzIH0gPSB0aGlzLnhocjtcbiAgLy8gaGFuZGxlIElFOSBidWc6IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMTAwNDY5NzIvbXNpZS1yZXR1cm5zLXN0YXR1cy1jb2RlLW9mLTEyMjMtZm9yLWFqYXgtcmVxdWVzdFxuICBpZiAoc3RhdHVzID09PSAxMjIzKSB7XG4gICAgc3RhdHVzID0gMjA0O1xuICB9XG5cbiAgdGhpcy5fc2V0U3RhdHVzUHJvcGVydGllcyhzdGF0dXMpO1xuICB0aGlzLmhlYWRlcnMgPSBwYXJzZUhlYWRlcih0aGlzLnhoci5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKSk7XG4gIHRoaXMuaGVhZGVyID0gdGhpcy5oZWFkZXJzO1xuICAvLyBnZXRBbGxSZXNwb25zZUhlYWRlcnMgc29tZXRpbWVzIGZhbHNlbHkgcmV0dXJucyBcIlwiIGZvciBDT1JTIHJlcXVlc3RzLCBidXRcbiAgLy8gZ2V0UmVzcG9uc2VIZWFkZXIgc3RpbGwgd29ya3MuIHNvIHdlIGdldCBjb250ZW50LXR5cGUgZXZlbiBpZiBnZXR0aW5nXG4gIC8vIG90aGVyIGhlYWRlcnMgZmFpbHMuXG4gIHRoaXMuaGVhZGVyWydjb250ZW50LXR5cGUnXSA9IHRoaXMueGhyLmdldFJlc3BvbnNlSGVhZGVyKCdjb250ZW50LXR5cGUnKTtcbiAgdGhpcy5fc2V0SGVhZGVyUHJvcGVydGllcyh0aGlzLmhlYWRlcik7XG5cbiAgaWYgKHRoaXMudGV4dCA9PT0gbnVsbCAmJiByZXF1ZXN0Xy5fcmVzcG9uc2VUeXBlKSB7XG4gICAgdGhpcy5ib2R5ID0gdGhpcy54aHIucmVzcG9uc2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXEubWV0aG9kID09PSAnSEVBRCcpIHtcbiAgICB0aGlzLmJvZHkgPSBudWxsO1xuICB9IGVsc2Uge1xuICAgIHRoaXMuYm9keSA9IHRoaXMuX3BhcnNlQm9keSh0aGlzLnRleHQgfHwgdGhpcy54aHIucmVzcG9uc2UpO1xuICB9XG59XG5cbm1peGluKFJlc3BvbnNlLnByb3RvdHlwZSwgUmVzcG9uc2VCYXNlLnByb3RvdHlwZSk7XG5cbi8qKlxuICogUGFyc2UgdGhlIGdpdmVuIGJvZHkgYHN0cmAuXG4gKlxuICogVXNlZCBmb3IgYXV0by1wYXJzaW5nIG9mIGJvZGllcy4gUGFyc2Vyc1xuICogYXJlIGRlZmluZWQgb24gdGhlIGBzdXBlcmFnZW50LnBhcnNlYCBvYmplY3QuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7TWl4ZWR9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXNwb25zZS5wcm90b3R5cGUuX3BhcnNlQm9keSA9IGZ1bmN0aW9uIChzdHJpbmdfKSB7XG4gIC8vIGB0aGlzLnR5cGVgIGlzIHRha2VuIGZyb20gdGhlIHJlc3BvbnNlOyBhbiBpbmhlcml0ZWQga2V5IHN1Y2ggYXNcbiAgLy8gXCJjb25zdHJ1Y3RvclwiIG11c3Qgbm90IHJlc29sdmUgdG8gYSBwYXJzZXJcbiAgbGV0IHBhcnNlID0gaGFzT3duKHJlcXVlc3QucGFyc2UsIHRoaXMudHlwZSlcbiAgICA/IHJlcXVlc3QucGFyc2VbdGhpcy50eXBlXVxuICAgIDogdW5kZWZpbmVkO1xuICBpZiAodGhpcy5yZXEuX3BhcnNlcikge1xuICAgIHJldHVybiB0aGlzLnJlcS5fcGFyc2VyKHRoaXMsIHN0cmluZ18pO1xuICB9XG5cbiAgaWYgKCFwYXJzZSAmJiBpc0pTT04odGhpcy50eXBlKSkge1xuICAgIHBhcnNlID0gcmVxdWVzdC5wYXJzZVsnYXBwbGljYXRpb24vanNvbiddO1xuICB9XG5cbiAgcmV0dXJuIHBhcnNlICYmIHN0cmluZ18gJiYgKHN0cmluZ18ubGVuZ3RoID4gMCB8fCBzdHJpbmdfIGluc3RhbmNlb2YgT2JqZWN0KVxuICAgID8gcGFyc2Uoc3RyaW5nXylcbiAgICA6IG51bGw7XG59O1xuXG4vKipcbiAqIFJldHVybiBhbiBgRXJyb3JgIHJlcHJlc2VudGF0aXZlIG9mIHRoaXMgcmVzcG9uc2UuXG4gKlxuICogQHJldHVybiB7RXJyb3J9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlc3BvbnNlLnByb3RvdHlwZS50b0Vycm9yID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCB7IHJlcSB9ID0gdGhpcztcbiAgY29uc3QgeyBtZXRob2QgfSA9IHJlcTtcbiAgY29uc3QgeyB1cmwgfSA9IHJlcTtcblxuICBjb25zdCBtZXNzYWdlID0gYGNhbm5vdCAke21ldGhvZH0gJHt1cmx9ICgke3RoaXMuc3RhdHVzfSlgO1xuICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgZXJyb3Iuc3RhdHVzID0gdGhpcy5zdGF0dXM7XG4gIGVycm9yLm1ldGhvZCA9IG1ldGhvZDtcbiAgZXJyb3IudXJsID0gdXJsO1xuXG4gIHJldHVybiBlcnJvcjtcbn07XG5cbi8qKlxuICogRXhwb3NlIGBSZXNwb25zZWAuXG4gKi9cblxucmVxdWVzdC5SZXNwb25zZSA9IFJlc3BvbnNlO1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYFJlcXVlc3RgIHdpdGggdGhlIGdpdmVuIGBtZXRob2RgIGFuZCBgdXJsYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbWV0aG9kXG4gKiBAcGFyYW0ge1N0cmluZ30gdXJsXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIFJlcXVlc3QobWV0aG9kLCB1cmwpIHtcbiAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gIHRoaXMuX3F1ZXJ5ID0gdGhpcy5fcXVlcnkgfHwgW107XG4gIHRoaXMubWV0aG9kID0gbWV0aG9kO1xuICB0aGlzLnVybCA9IHVybDtcbiAgdGhpcy5oZWFkZXIgPSB7fTsgLy8gcHJlc2VydmVzIGhlYWRlciBuYW1lIGNhc2VcbiAgdGhpcy5faGVhZGVyID0ge307IC8vIGNvZXJjZXMgaGVhZGVyIG5hbWVzIHRvIGxvd2VyY2FzZVxuICB0aGlzLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgbGV0IGVycm9yID0gbnVsbDtcbiAgICBsZXQgcmVzID0gbnVsbDtcblxuICAgIHRyeSB7XG4gICAgICByZXMgPSBuZXcgUmVzcG9uc2Uoc2VsZik7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBlcnJvciA9IG5ldyBFcnJvcignUGFyc2VyIGlzIHVuYWJsZSB0byBwYXJzZSB0aGUgcmVzcG9uc2UnKTtcbiAgICAgIGVycm9yLnBhcnNlID0gdHJ1ZTtcbiAgICAgIGVycm9yLm9yaWdpbmFsID0gZXJyO1xuICAgICAgLy8gaXNzdWUgIzY3NTogcmV0dXJuIHRoZSByYXcgcmVzcG9uc2UgaWYgdGhlIHJlc3BvbnNlIHBhcnNpbmcgZmFpbHNcbiAgICAgIGlmIChzZWxmLnhocikge1xuICAgICAgICAvLyBpZTkgZG9lc24ndCBoYXZlICdyZXNwb25zZScgcHJvcGVydHlcbiAgICAgICAgZXJyb3IucmF3UmVzcG9uc2UgPVxuICAgICAgICAgIHR5cGVvZiBzZWxmLnhoci5yZXNwb25zZVR5cGUgPT09ICd1bmRlZmluZWQnXG4gICAgICAgICAgICA/IHNlbGYueGhyLnJlc3BvbnNlVGV4dFxuICAgICAgICAgICAgOiBzZWxmLnhoci5yZXNwb25zZTtcbiAgICAgICAgLy8gaXNzdWUgIzg3NjogcmV0dXJuIHRoZSBodHRwIHN0YXR1cyBjb2RlIGlmIHRoZSByZXNwb25zZSBwYXJzaW5nIGZhaWxzXG4gICAgICAgIGVycm9yLnN0YXR1cyA9IHNlbGYueGhyLnN0YXR1cyB8fCBudWxsO1xuICAgICAgICBlcnJvci5zdGF0dXNDb2RlID0gZXJyb3Iuc3RhdHVzOyAvLyBiYWNrd2FyZHMtY29tcGF0IG9ubHlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVycm9yLnJhd1Jlc3BvbnNlID0gbnVsbDtcbiAgICAgICAgZXJyb3Iuc3RhdHVzID0gbnVsbDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHNlbGYuY2FsbGJhY2soZXJyb3IpO1xuICAgIH1cblxuICAgIHNlbGYuZW1pdCgncmVzcG9uc2UnLCByZXMpO1xuXG4gICAgbGV0IG5ld19lcnJvcjtcbiAgICB0cnkge1xuICAgICAgaWYgKCFzZWxmLl9pc1Jlc3BvbnNlT0socmVzKSkge1xuICAgICAgICBuZXdfZXJyb3IgPSBuZXcgRXJyb3IoXG4gICAgICAgICAgcmVzLnN0YXR1c1RleHQgfHwgcmVzLnRleHQgfHwgJ1Vuc3VjY2Vzc2Z1bCBIVFRQIHJlc3BvbnNlJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgbmV3X2Vycm9yID0gZXJyOyAvLyBvaygpIGNhbGxiYWNrIGNhbiB0aHJvd1xuICAgIH1cblxuICAgIC8vICMxMDAwIGRvbid0IGNhdGNoIGVycm9ycyBmcm9tIHRoZSBjYWxsYmFjayB0byBhdm9pZCBkb3VibGUgY2FsbGluZyBpdFxuICAgIGlmIChuZXdfZXJyb3IpIHtcbiAgICAgIG5ld19lcnJvci5vcmlnaW5hbCA9IGVycm9yO1xuICAgICAgbmV3X2Vycm9yLnJlc3BvbnNlID0gcmVzO1xuICAgICAgbmV3X2Vycm9yLnN0YXR1cyA9IG5ld19lcnJvci5zdGF0dXMgfHwgcmVzLnN0YXR1cztcbiAgICAgIHNlbGYuY2FsbGJhY2sobmV3X2Vycm9yLCByZXMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZWxmLmNhbGxiYWNrKG51bGwsIHJlcyk7XG4gICAgfVxuICB9KTtcbn1cblxuLyoqXG4gKiBNaXhpbiBgRW1pdHRlcmAgYW5kIGBSZXF1ZXN0QmFzZWAuXG4gKi9cblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5ldy1jYXBcbkVtaXR0ZXIoUmVxdWVzdC5wcm90b3R5cGUpO1xuXG5taXhpbihSZXF1ZXN0LnByb3RvdHlwZSwgUmVxdWVzdEJhc2UucHJvdG90eXBlKTtcblxuLyoqXG4gKiBTZXQgQ29udGVudC1UeXBlIHRvIGB0eXBlYCwgbWFwcGluZyB2YWx1ZXMgZnJvbSBgcmVxdWVzdC50eXBlc2AuXG4gKlxuICogRXhhbXBsZXM6XG4gKlxuICogICAgICBzdXBlcmFnZW50LnR5cGVzLnhtbCA9ICdhcHBsaWNhdGlvbi94bWwnO1xuICpcbiAqICAgICAgcmVxdWVzdC5wb3N0KCcvJylcbiAqICAgICAgICAudHlwZSgneG1sJylcbiAqICAgICAgICAuc2VuZCh4bWxzdHJpbmcpXG4gKiAgICAgICAgLmVuZChjYWxsYmFjayk7XG4gKlxuICogICAgICByZXF1ZXN0LnBvc3QoJy8nKVxuICogICAgICAgIC50eXBlKCdhcHBsaWNhdGlvbi94bWwnKVxuICogICAgICAgIC5zZW5kKHhtbHN0cmluZylcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZVxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLnR5cGUgPSBmdW5jdGlvbiAodHlwZSkge1xuICB0aGlzLnNldCgnQ29udGVudC1UeXBlJywgbG9va3VwVHlwZSh0eXBlKSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgQWNjZXB0IHRvIGB0eXBlYCwgbWFwcGluZyB2YWx1ZXMgZnJvbSBgcmVxdWVzdC50eXBlc2AuXG4gKlxuICogRXhhbXBsZXM6XG4gKlxuICogICAgICBzdXBlcmFnZW50LnR5cGVzLmpzb24gPSAnYXBwbGljYXRpb24vanNvbic7XG4gKlxuICogICAgICByZXF1ZXN0LmdldCgnL2FnZW50JylcbiAqICAgICAgICAuYWNjZXB0KCdqc29uJylcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiAgICAgIHJlcXVlc3QuZ2V0KCcvYWdlbnQnKVxuICogICAgICAgIC5hY2NlcHQoJ2FwcGxpY2F0aW9uL2pzb24nKVxuICogICAgICAgIC5lbmQoY2FsbGJhY2spO1xuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBhY2NlcHRcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5hY2NlcHQgPSBmdW5jdGlvbiAodHlwZSkge1xuICB0aGlzLnNldCgnQWNjZXB0JywgbG9va3VwVHlwZSh0eXBlKSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgQXV0aG9yaXphdGlvbiBmaWVsZCB2YWx1ZSB3aXRoIGB1c2VyYCBhbmQgYHBhc3NgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1c2VyXG4gKiBAcGFyYW0ge1N0cmluZ30gW3Bhc3NdIG9wdGlvbmFsIGluIGNhc2Ugb2YgdXNpbmcgJ2JlYXJlcicgYXMgdHlwZVxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgd2l0aCAndHlwZScgcHJvcGVydHkgJ2F1dG8nLCAnYmFzaWMnIG9yICdiZWFyZXInIChkZWZhdWx0ICdiYXNpYycpXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuYXV0aCA9IGZ1bmN0aW9uICh1c2VyLCBwYXNzLCBvcHRpb25zKSB7XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSBwYXNzID0gJyc7XG4gIGlmICh0eXBlb2YgcGFzcyA9PT0gJ29iamVjdCcgJiYgcGFzcyAhPT0gbnVsbCkge1xuICAgIC8vIHBhc3MgaXMgb3B0aW9uYWwgYW5kIGNhbiBiZSByZXBsYWNlZCB3aXRoIG9wdGlvbnNcbiAgICBvcHRpb25zID0gcGFzcztcbiAgICBwYXNzID0gJyc7XG4gIH1cblxuICBpZiAoIW9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0ge1xuICAgICAgdHlwZTogdHlwZW9mIGJ0b2EgPT09ICdmdW5jdGlvbicgPyAnYmFzaWMnIDogJ2F1dG8nXG4gICAgfTtcbiAgfVxuXG4gIGxldCB7IGVuY29kZXIgfSA9IG9wdGlvbnM7XG4gIGlmICghZW5jb2Rlcikge1xuICAgIGVuY29kZXIgPSAoc3RyaW5nKSA9PiB7XG4gICAgICBpZiAodHlwZW9mIGJ0b2EgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIGJ0b2Eoc3RyaW5nKTtcbiAgICAgIH1cblxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdXNlIGJhc2ljIGF1dGgsIGJ0b2EgaXMgbm90IGEgZnVuY3Rpb24nKTtcbiAgICB9O1xuICB9XG5cbiAgcmV0dXJuIHRoaXMuX2F1dGgodXNlciwgcGFzcywgb3B0aW9ucywgZW5jb2Rlcik7XG59O1xuXG4vKipcbiAqIEFkZCBxdWVyeS1zdHJpbmcgYHZhbGAuXG4gKlxuICogRXhhbXBsZXM6XG4gKlxuICogICByZXF1ZXN0LmdldCgnL3Nob2VzJylcbiAqICAgICAucXVlcnkoJ3NpemU9MTAnKVxuICogICAgIC5xdWVyeSh7IGNvbG9yOiAnYmx1ZScgfSlcbiAqXG4gKiBAcGFyYW0ge09iamVjdHxTdHJpbmd9IHZhbFxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3QucHJvdG90eXBlLnF1ZXJ5ID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gIGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnKSB2YWx1ZSA9IHNlcmlhbGl6ZSh2YWx1ZSk7XG4gIGlmICh2YWx1ZSkgdGhpcy5fcXVlcnkucHVzaCh2YWx1ZSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBRdWV1ZSB0aGUgZ2l2ZW4gYGZpbGVgIGFzIGFuIGF0dGFjaG1lbnQgdG8gdGhlIHNwZWNpZmllZCBgZmllbGRgLFxuICogd2l0aCBvcHRpb25hbCBgb3B0aW9uc2AgKG9yIGZpbGVuYW1lKS5cbiAqXG4gKiBgYGAganNcbiAqIHJlcXVlc3QucG9zdCgnL3VwbG9hZCcpXG4gKiAgIC5hdHRhY2goJ2NvbnRlbnQnLCBuZXcgQmxvYihbJzxhIGlkPVwiYVwiPjxiIGlkPVwiYlwiPmhleSE8L2I+PC9hPiddLCB7IHR5cGU6IFwidGV4dC9odG1sXCJ9KSlcbiAqICAgLmVuZChjYWxsYmFjayk7XG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmllbGRcbiAqIEBwYXJhbSB7QmxvYnxGaWxlfSBmaWxlXG4gKiBAcGFyYW0ge1N0cmluZ3xPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5hdHRhY2ggPSBmdW5jdGlvbiAoZmllbGQsIGZpbGUsIG9wdGlvbnMpIHtcbiAgaWYgKGZpbGUpIHtcbiAgICBpZiAodGhpcy5fZGF0YSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwic3VwZXJhZ2VudCBjYW4ndCBtaXggLnNlbmQoKSBhbmQgLmF0dGFjaCgpXCIpO1xuICAgIH1cblxuICAgIHRoaXMuX2dldEZvcm1EYXRhKCkuYXBwZW5kKGZpZWxkLCBmaWxlLCBvcHRpb25zIHx8IGZpbGUubmFtZSk7XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cblJlcXVlc3QucHJvdG90eXBlLl9nZXRGb3JtRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLl9mb3JtRGF0YSkge1xuICAgIHRoaXMuX2Zvcm1EYXRhID0gbmV3IHJvb3QuRm9ybURhdGEoKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzLl9mb3JtRGF0YTtcbn07XG5cbi8qKlxuICogSW52b2tlIHRoZSBjYWxsYmFjayB3aXRoIGBlcnJgIGFuZCBgcmVzYFxuICogYW5kIGhhbmRsZSBhcml0eSBjaGVjay5cbiAqXG4gKiBAcGFyYW0ge0Vycm9yfSBlcnJcbiAqIEBwYXJhbSB7UmVzcG9uc2V9IHJlc1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuY2FsbGJhY2sgPSBmdW5jdGlvbiAoZXJyb3IsIHJlcykge1xuICBpZiAodGhpcy5fc2hvdWxkUmV0cnkoZXJyb3IsIHJlcykpIHtcbiAgICByZXR1cm4gdGhpcy5fcmV0cnkoKTtcbiAgfVxuXG4gIGNvbnN0IGZuID0gdGhpcy5fY2FsbGJhY2s7XG4gIHRoaXMuY2xlYXJUaW1lb3V0KCk7XG5cbiAgaWYgKGVycm9yKSB7XG4gICAgaWYgKHRoaXMuX21heFJldHJpZXMpIGVycm9yLnJldHJpZXMgPSB0aGlzLl9yZXRyaWVzIC0gMTtcbiAgICB0aGlzLmVtaXQoJ2Vycm9yJywgZXJyb3IpO1xuICB9XG5cbiAgZm4oZXJyb3IsIHJlcyk7XG59O1xuXG4vKipcbiAqIEludm9rZSBjYWxsYmFjayB3aXRoIHgtZG9tYWluIGVycm9yLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJlcXVlc3QucHJvdG90eXBlLmNyb3NzRG9tYWluRXJyb3IgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKFxuICAgICdSZXF1ZXN0IGhhcyBiZWVuIHRlcm1pbmF0ZWRcXG5Qb3NzaWJsZSBjYXVzZXM6IHRoZSBuZXR3b3JrIGlzIG9mZmxpbmUsIE9yaWdpbiBpcyBub3QgYWxsb3dlZCBieSBBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4sIHRoZSBwYWdlIGlzIGJlaW5nIHVubG9hZGVkLCBldGMuJ1xuICApO1xuICBlcnJvci5jcm9zc0RvbWFpbiA9IHRydWU7XG5cbiAgZXJyb3Iuc3RhdHVzID0gdGhpcy5zdGF0dXM7XG4gIGVycm9yLm1ldGhvZCA9IHRoaXMubWV0aG9kO1xuICBlcnJvci51cmwgPSB0aGlzLnVybDtcblxuICB0aGlzLmNhbGxiYWNrKGVycm9yKTtcbn07XG5cbi8vIFRoaXMgb25seSB3YXJucywgYmVjYXVzZSB0aGUgcmVxdWVzdCBpcyBzdGlsbCBsaWtlbHkgdG8gd29ya1xuUmVxdWVzdC5wcm90b3R5cGUuYWdlbnQgPSBmdW5jdGlvbiAoKSB7XG4gIGNvbnNvbGUud2FybignVGhpcyBpcyBub3Qgc3VwcG9ydGVkIGluIGJyb3dzZXIgdmVyc2lvbiBvZiBzdXBlcmFnZW50Jyk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuUmVxdWVzdC5wcm90b3R5cGUuY2EgPSBSZXF1ZXN0LnByb3RvdHlwZS5hZ2VudDtcblJlcXVlc3QucHJvdG90eXBlLmJ1ZmZlciA9IFJlcXVlc3QucHJvdG90eXBlLmNhO1xuXG4vLyBUaGlzIHRocm93cywgYmVjYXVzZSBpdCBjYW4ndCBzZW5kL3JlY2VpdmUgZGF0YSBhcyBleHBlY3RlZFxuUmVxdWVzdC5wcm90b3R5cGUud3JpdGUgPSAoKSA9PiB7XG4gIHRocm93IG5ldyBFcnJvcihcbiAgICAnU3RyZWFtaW5nIGlzIG5vdCBzdXBwb3J0ZWQgaW4gYnJvd3NlciB2ZXJzaW9uIG9mIHN1cGVyYWdlbnQnXG4gICk7XG59O1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5waXBlID0gUmVxdWVzdC5wcm90b3R5cGUud3JpdGU7XG5cbi8qKlxuICogQ2hlY2sgaWYgYG9iamAgaXMgYSBob3N0IG9iamVjdCxcbiAqIHdlIGRvbid0IHdhbnQgdG8gc2VyaWFsaXplIHRoZXNlIDopXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9iaiBob3N0IG9iamVjdFxuICogQHJldHVybiB7Qm9vbGVhbn0gaXMgYSBob3N0IG9iamVjdFxuICogQGFwaSBwcml2YXRlXG4gKi9cblJlcXVlc3QucHJvdG90eXBlLl9pc0hvc3QgPSBmdW5jdGlvbiAob2JqZWN0KSB7XG4gIC8vIE5hdGl2ZSBvYmplY3RzIHN0cmluZ2lmeSB0byBbb2JqZWN0IEZpbGVdLCBbb2JqZWN0IEJsb2JdLCBbb2JqZWN0IEZvcm1EYXRhXSwgZXRjLlxuICByZXR1cm4gKFxuICAgIG9iamVjdCAmJlxuICAgIHR5cGVvZiBvYmplY3QgPT09ICdvYmplY3QnICYmXG4gICAgIUFycmF5LmlzQXJyYXkob2JqZWN0KSAmJlxuICAgIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmplY3QpICE9PSAnW29iamVjdCBPYmplY3RdJ1xuICApO1xufTtcblxuLyoqXG4gKiBJbml0aWF0ZSByZXF1ZXN0LCBpbnZva2luZyBjYWxsYmFjayBgZm4ocmVzKWBcbiAqIHdpdGggYW4gaW5zdGFuY2VvZiBgUmVzcG9uc2VgLlxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdC5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24gKGZuKSB7XG4gIGlmICh0aGlzLl9lbmRDYWxsZWQpIHtcbiAgICBjb25zb2xlLndhcm4oXG4gICAgICAnV2FybmluZzogLmVuZCgpIHdhcyBjYWxsZWQgdHdpY2UuIFRoaXMgaXMgbm90IHN1cHBvcnRlZCBpbiBzdXBlcmFnZW50J1xuICAgICk7XG4gIH1cblxuICB0aGlzLl9lbmRDYWxsZWQgPSB0cnVlO1xuXG4gIC8vIHN0b3JlIGNhbGxiYWNrXG4gIHRoaXMuX2NhbGxiYWNrID0gZm4gfHwgbm9vcDtcblxuICAvLyBxdWVyeXN0cmluZ1xuICB0aGlzLl9maW5hbGl6ZVF1ZXJ5U3RyaW5nKCk7XG5cbiAgdGhpcy5fZW5kKCk7XG59O1xuXG5SZXF1ZXN0LnByb3RvdHlwZS5fc2V0VXBsb2FkVGltZW91dCA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgLy8gdXBsb2FkIHRpbWVvdXQgaXQncyB3b2tycyBvbmx5IGlmIGRlYWRsaW5lIHRpbWVvdXQgaXMgb2ZmXG4gIGlmICh0aGlzLl91cGxvYWRUaW1lb3V0ICYmICF0aGlzLl91cGxvYWRUaW1lb3V0VGltZXIpIHtcbiAgICB0aGlzLl91cGxvYWRUaW1lb3V0VGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHNlbGYuX3RpbWVvdXRFcnJvcihcbiAgICAgICAgJ1VwbG9hZCB0aW1lb3V0IG9mICcsXG4gICAgICAgIHNlbGYuX3VwbG9hZFRpbWVvdXQsXG4gICAgICAgICdFVElNRURPVVQnXG4gICAgICApO1xuICAgIH0sIHRoaXMuX3VwbG9hZFRpbWVvdXQpO1xuICB9XG59O1xuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgY29tcGxleGl0eVxuUmVxdWVzdC5wcm90b3R5cGUuX2VuZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuX2Fib3J0ZWQpXG4gICAgcmV0dXJuIHRoaXMuY2FsbGJhY2soXG4gICAgICBuZXcgRXJyb3IoJ1RoZSByZXF1ZXN0IGhhcyBiZWVuIGFib3J0ZWQgZXZlbiBiZWZvcmUgLmVuZCgpIHdhcyBjYWxsZWQnKVxuICAgICk7XG5cbiAgY29uc3Qgc2VsZiA9IHRoaXM7XG4gIHRoaXMueGhyID0gcmVxdWVzdC5nZXRYSFIoKTtcbiAgY29uc3QgeyB4aHIgfSA9IHRoaXM7XG4gIGxldCBkYXRhID0gdGhpcy5fZm9ybURhdGEgfHwgdGhpcy5fZGF0YTtcblxuICB0aGlzLl9zZXRUaW1lb3V0cygpO1xuXG4gIC8vIHN0YXRlIGNoYW5nZVxuICB4aHIuYWRkRXZlbnRMaXN0ZW5lcigncmVhZHlzdGF0ZWNoYW5nZScsICgpID0+IHtcbiAgICBjb25zdCB7IHJlYWR5U3RhdGUgfSA9IHhocjtcbiAgICBpZiAocmVhZHlTdGF0ZSA+PSAyICYmIHNlbGYuX3Jlc3BvbnNlVGltZW91dFRpbWVyKSB7XG4gICAgICBjbGVhclRpbWVvdXQoc2VsZi5fcmVzcG9uc2VUaW1lb3V0VGltZXIpO1xuICAgIH1cblxuICAgIGlmIChyZWFkeVN0YXRlICE9PSA0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gSW4gSUU5LCByZWFkcyB0byBhbnkgcHJvcGVydHkgKGUuZy4gc3RhdHVzKSBvZmYgb2YgYW4gYWJvcnRlZCBYSFIgd2lsbFxuICAgIC8vIHJlc3VsdCBpbiB0aGUgZXJyb3IgXCJDb3VsZCBub3QgY29tcGxldGUgdGhlIG9wZXJhdGlvbiBkdWUgdG8gZXJyb3IgYzAwYzAyM2ZcIlxuICAgIGxldCBzdGF0dXM7XG4gICAgdHJ5IHtcbiAgICAgIHN0YXR1cyA9IHhoci5zdGF0dXM7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBzdGF0dXMgPSAwO1xuICAgIH1cblxuICAgIGlmICghc3RhdHVzKSB7XG4gICAgICBpZiAoc2VsZi50aW1lZG91dCB8fCBzZWxmLl9hYm9ydGVkKSByZXR1cm47XG4gICAgICByZXR1cm4gc2VsZi5jcm9zc0RvbWFpbkVycm9yKCk7XG4gICAgfVxuXG4gICAgc2VsZi5lbWl0KCdlbmQnKTtcbiAgfSk7XG5cbiAgLy8gcHJvZ3Jlc3NcbiAgY29uc3QgaGFuZGxlUHJvZ3Jlc3MgPSAoZGlyZWN0aW9uLCBlKSA9PiB7XG4gICAgaWYgKGUudG90YWwgPiAwKSB7XG4gICAgICBlLnBlcmNlbnQgPSAoZS5sb2FkZWQgLyBlLnRvdGFsKSAqIDEwMDtcblxuICAgICAgaWYgKGUucGVyY2VudCA9PT0gMTAwKSB7XG4gICAgICAgIGNsZWFyVGltZW91dChzZWxmLl91cGxvYWRUaW1lb3V0VGltZXIpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGUuZGlyZWN0aW9uID0gZGlyZWN0aW9uO1xuICAgIHNlbGYuZW1pdCgncHJvZ3Jlc3MnLCBlKTtcbiAgfTtcblxuICBpZiAodGhpcy5oYXNMaXN0ZW5lcnMoJ3Byb2dyZXNzJykpIHtcbiAgICB0cnkge1xuICAgICAgeGhyLmFkZEV2ZW50TGlzdGVuZXIoJ3Byb2dyZXNzJywgaGFuZGxlUHJvZ3Jlc3MuYmluZChudWxsLCAnZG93bmxvYWQnKSk7XG4gICAgICBpZiAoeGhyLnVwbG9hZCkge1xuICAgICAgICB4aHIudXBsb2FkLmFkZEV2ZW50TGlzdGVuZXIoXG4gICAgICAgICAgJ3Byb2dyZXNzJyxcbiAgICAgICAgICBoYW5kbGVQcm9ncmVzcy5iaW5kKG51bGwsICd1cGxvYWQnKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgLy8gQWNjZXNzaW5nIHhoci51cGxvYWQgZmFpbHMgaW4gSUUgZnJvbSBhIHdlYiB3b3JrZXIsIHNvIGp1c3QgcHJldGVuZCBpdCBkb2Vzbid0IGV4aXN0LlxuICAgICAgLy8gUmVwb3J0ZWQgaGVyZTpcbiAgICAgIC8vIGh0dHBzOi8vY29ubmVjdC5taWNyb3NvZnQuY29tL0lFL2ZlZWRiYWNrL2RldGFpbHMvODM3MjQ1L3htbGh0dHByZXF1ZXN0LXVwbG9hZC10aHJvd3MtaW52YWxpZC1hcmd1bWVudC13aGVuLXVzZWQtZnJvbS13ZWItd29ya2VyLWNvbnRleHRcbiAgICB9XG4gIH1cblxuICBpZiAoeGhyLnVwbG9hZCkge1xuICAgIHRoaXMuX3NldFVwbG9hZFRpbWVvdXQoKTtcbiAgfVxuXG4gIC8vIGluaXRpYXRlIHJlcXVlc3RcbiAgdHJ5IHtcbiAgICBpZiAodGhpcy51c2VybmFtZSAmJiB0aGlzLnBhc3N3b3JkKSB7XG4gICAgICB4aHIub3Blbih0aGlzLm1ldGhvZCwgdGhpcy51cmwsIHRydWUsIHRoaXMudXNlcm5hbWUsIHRoaXMucGFzc3dvcmQpO1xuICAgIH0gZWxzZSB7XG4gICAgICB4aHIub3Blbih0aGlzLm1ldGhvZCwgdGhpcy51cmwsIHRydWUpO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgLy8gc2VlICMxMTQ5XG4gICAgcmV0dXJuIHRoaXMuY2FsbGJhY2soZXJyKTtcbiAgfVxuXG4gIC8vIENPUlNcbiAgaWYgKHRoaXMuX3dpdGhDcmVkZW50aWFscykgeGhyLndpdGhDcmVkZW50aWFscyA9IHRydWU7XG5cbiAgLy8gYm9keVxuICBpZiAoXG4gICAgIXRoaXMuX2Zvcm1EYXRhICYmXG4gICAgdGhpcy5tZXRob2QgIT09ICdHRVQnICYmXG4gICAgdGhpcy5tZXRob2QgIT09ICdIRUFEJyAmJlxuICAgIHR5cGVvZiBkYXRhICE9PSAnc3RyaW5nJyAmJlxuICAgICF0aGlzLl9pc0hvc3QoZGF0YSlcbiAgKSB7XG4gICAgLy8gc2VyaWFsaXplIHN0dWZmXG4gICAgY29uc3QgY29udGVudFR5cGUgPSB0aGlzLl9oZWFkZXJbJ2NvbnRlbnQtdHlwZSddO1xuICAgIGNvbnN0IHNlcmlhbGl6ZVR5cGUgPSBjb250ZW50VHlwZSA/IGNvbnRlbnRUeXBlLnNwbGl0KCc7JylbMF0gOiAnJztcbiAgICBsZXQgc2VyaWFsaXplID1cbiAgICAgIHRoaXMuX3NlcmlhbGl6ZXIgfHxcbiAgICAgIChoYXNPd24ocmVxdWVzdC5zZXJpYWxpemUsIHNlcmlhbGl6ZVR5cGUpXG4gICAgICAgID8gcmVxdWVzdC5zZXJpYWxpemVbc2VyaWFsaXplVHlwZV1cbiAgICAgICAgOiB1bmRlZmluZWQpO1xuICAgIGlmICghc2VyaWFsaXplICYmIGlzSlNPTihjb250ZW50VHlwZSkpIHtcbiAgICAgIHNlcmlhbGl6ZSA9IHJlcXVlc3Quc2VyaWFsaXplWydhcHBsaWNhdGlvbi9qc29uJ107XG4gICAgfVxuXG4gICAgaWYgKHNlcmlhbGl6ZSkgZGF0YSA9IHNlcmlhbGl6ZShkYXRhKTtcbiAgfVxuXG4gIC8vIHNldCBoZWFkZXIgZmllbGRzXG4gIHRyeSB7XG4gICAgZm9yIChjb25zdCBmaWVsZCBpbiB0aGlzLmhlYWRlcikge1xuICAgICAgaWYgKHRoaXMuaGVhZGVyW2ZpZWxkXSA9PT0gbnVsbCkgY29udGludWU7XG5cbiAgICAgIGlmIChoYXNPd24odGhpcy5oZWFkZXIsIGZpZWxkKSlcbiAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoZmllbGQsIHRoaXMuaGVhZGVyW2ZpZWxkXSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3Jlc3BvbnNlVHlwZSkge1xuICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9IHRoaXMuX3Jlc3BvbnNlVHlwZTtcbiAgICB9XG5cbiAgICAvLyBzZW5kIHN0dWZmXG4gICAgdGhpcy5lbWl0KCdyZXF1ZXN0JywgdGhpcyk7XG5cbiAgICAvLyBJRTExIHhoci5zZW5kKHVuZGVmaW5lZCkgc2VuZHMgJ3VuZGVmaW5lZCcgc3RyaW5nIGFzIFBPU1QgcGF5bG9hZCAoaW5zdGVhZCBvZiBub3RoaW5nKVxuICAgIC8vIFdlIG5lZWQgbnVsbCBoZXJlIGlmIGRhdGEgaXMgdW5kZWZpbmVkXG4gICAgeGhyLnNlbmQodHlwZW9mIGRhdGEgPT09ICd1bmRlZmluZWQnID8gbnVsbCA6IGRhdGEpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICB0cnkge1xuICAgICAgeGhyLmFib3J0KCk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAvLyBpZ25vcmVcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5jYWxsYmFjayhlcnIpO1xuICB9XG59O1xuXG4vLyBjcmVhdGUgYSBQcm94eSB0aGF0IGNhbiBpbnN0YW50aWF0ZSBhIG5ldyBBZ2VudCB3aXRob3V0IHVzaW5nIGBuZXdgIGtleXdvcmRcbi8vIChmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSBhbmQgY2hhaW5pbmcpXG5jb25zdCBwcm94eUFnZW50ID0gbmV3IFByb3h5KEFnZW50LCB7XG4gIGFwcGx5KHRhcmdldCwgdGhpc0FyZywgYXJndW1lbnRzTGlzdCkge1xuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuZXctY2FwXG4gICAgcmV0dXJuIG5ldyB0YXJnZXQoLi4uYXJndW1lbnRzTGlzdCk7XG4gIH1cbn0pO1xucmVxdWVzdC5hZ2VudCA9IHByb3h5QWdlbnQ7XG5cbmZvciAoY29uc3QgbWV0aG9kIG9mIFtcbiAgJ0dFVCcsXG4gICdIRUFEJyxcbiAgJ1BPU1QnLFxuICAnT1BUSU9OUycsXG4gICdQQVRDSCcsXG4gICdQVVQnLFxuICAnREVMRVRFJ1xuXSkge1xuICBBZ2VudC5wcm90b3R5cGVbbWV0aG9kLnRvTG93ZXJDYXNlKCldID0gZnVuY3Rpb24gKHVybCwgZm4pIHtcbiAgICBjb25zdCByZXF1ZXN0XyA9IG5ldyByZXF1ZXN0LlJlcXVlc3QobWV0aG9kLCB1cmwpO1xuICAgIHRoaXMuX3NldERlZmF1bHRzKHJlcXVlc3RfKTtcbiAgICBpZiAoZm4pIHtcbiAgICAgIHJlcXVlc3RfLmVuZChmbik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlcXVlc3RfO1xuICB9O1xufVxuXG5BZ2VudC5wcm90b3R5cGUuZGVsID0gQWdlbnQucHJvdG90eXBlLmRlbGV0ZTtcblxuLyoqXG4gKiBHRVQgYHVybGAgd2l0aCBvcHRpb25hbCBjYWxsYmFjayBgZm4ocmVzKWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVybFxuICogQHBhcmFtIHtNaXhlZHxGdW5jdGlvbn0gW2RhdGFdIG9yIGZuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbZm5dXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5yZXF1ZXN0LmdldCA9ICh1cmwsIGRhdGEsIGZuKSA9PiB7XG4gIGNvbnN0IHJlcXVlc3RfID0gcmVxdWVzdCgnR0VUJywgdXJsKTtcbiAgaWYgKHR5cGVvZiBkYXRhID09PSAnZnVuY3Rpb24nKSB7XG4gICAgZm4gPSBkYXRhO1xuICAgIGRhdGEgPSBudWxsO1xuICB9XG5cbiAgaWYgKGRhdGEpIHJlcXVlc3RfLnF1ZXJ5KGRhdGEpO1xuICBpZiAoZm4pIHJlcXVlc3RfLmVuZChmbik7XG4gIHJldHVybiByZXF1ZXN0Xztcbn07XG5cbi8qKlxuICogSEVBRCBgdXJsYCB3aXRoIG9wdGlvbmFsIGNhbGxiYWNrIGBmbihyZXMpYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdXJsXG4gKiBAcGFyYW0ge01peGVkfEZ1bmN0aW9ufSBbZGF0YV0gb3IgZm5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtmbl1cbiAqIEByZXR1cm4ge1JlcXVlc3R9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbnJlcXVlc3QuaGVhZCA9ICh1cmwsIGRhdGEsIGZuKSA9PiB7XG4gIGNvbnN0IHJlcXVlc3RfID0gcmVxdWVzdCgnSEVBRCcsIHVybCk7XG4gIGlmICh0eXBlb2YgZGF0YSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIGZuID0gZGF0YTtcbiAgICBkYXRhID0gbnVsbDtcbiAgfVxuXG4gIGlmIChkYXRhKSByZXF1ZXN0Xy5xdWVyeShkYXRhKTtcbiAgaWYgKGZuKSByZXF1ZXN0Xy5lbmQoZm4pO1xuICByZXR1cm4gcmVxdWVzdF87XG59O1xuXG4vKipcbiAqIE9QVElPTlMgcXVlcnkgdG8gYHVybGAgd2l0aCBvcHRpb25hbCBjYWxsYmFjayBgZm4ocmVzKWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVybFxuICogQHBhcmFtIHtNaXhlZHxGdW5jdGlvbn0gW2RhdGFdIG9yIGZuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbZm5dXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5yZXF1ZXN0Lm9wdGlvbnMgPSAodXJsLCBkYXRhLCBmbikgPT4ge1xuICBjb25zdCByZXF1ZXN0XyA9IHJlcXVlc3QoJ09QVElPTlMnLCB1cmwpO1xuICBpZiAodHlwZW9mIGRhdGEgPT09ICdmdW5jdGlvbicpIHtcbiAgICBmbiA9IGRhdGE7XG4gICAgZGF0YSA9IG51bGw7XG4gIH1cblxuICBpZiAoZGF0YSkgcmVxdWVzdF8uc2VuZChkYXRhKTtcbiAgaWYgKGZuKSByZXF1ZXN0Xy5lbmQoZm4pO1xuICByZXR1cm4gcmVxdWVzdF87XG59O1xuXG4vKipcbiAqIERFTEVURSBgdXJsYCB3aXRoIG9wdGlvbmFsIGBkYXRhYCBhbmQgY2FsbGJhY2sgYGZuKHJlcylgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmxcbiAqIEBwYXJhbSB7TWl4ZWR9IFtkYXRhXVxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2ZuXVxuICogQHJldHVybiB7UmVxdWVzdH1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZGVsKHVybCwgZGF0YSwgZm4pIHtcbiAgY29uc3QgcmVxdWVzdF8gPSByZXF1ZXN0KCdERUxFVEUnLCB1cmwpO1xuICBpZiAodHlwZW9mIGRhdGEgPT09ICdmdW5jdGlvbicpIHtcbiAgICBmbiA9IGRhdGE7XG4gICAgZGF0YSA9IG51bGw7XG4gIH1cblxuICBpZiAoZGF0YSkgcmVxdWVzdF8uc2VuZChkYXRhKTtcbiAgaWYgKGZuKSByZXF1ZXN0Xy5lbmQoZm4pO1xuICByZXR1cm4gcmVxdWVzdF87XG59XG5cbnJlcXVlc3QuZGVsID0gZGVsO1xucmVxdWVzdC5kZWxldGUgPSBkZWw7XG5cbi8qKlxuICogUEFUQ0ggYHVybGAgd2l0aCBvcHRpb25hbCBgZGF0YWAgYW5kIGNhbGxiYWNrIGBmbihyZXMpYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdXJsXG4gKiBAcGFyYW0ge01peGVkfSBbZGF0YV1cbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtmbl1cbiAqIEByZXR1cm4ge1JlcXVlc3R9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbnJlcXVlc3QucGF0Y2ggPSAodXJsLCBkYXRhLCBmbikgPT4ge1xuICBjb25zdCByZXF1ZXN0XyA9IHJlcXVlc3QoJ1BBVENIJywgdXJsKTtcbiAgaWYgKHR5cGVvZiBkYXRhID09PSAnZnVuY3Rpb24nKSB7XG4gICAgZm4gPSBkYXRhO1xuICAgIGRhdGEgPSBudWxsO1xuICB9XG5cbiAgaWYgKGRhdGEpIHJlcXVlc3RfLnNlbmQoZGF0YSk7XG4gIGlmIChmbikgcmVxdWVzdF8uZW5kKGZuKTtcbiAgcmV0dXJuIHJlcXVlc3RfO1xufTtcblxuLyoqXG4gKiBQT1NUIGB1cmxgIHdpdGggb3B0aW9uYWwgYGRhdGFgIGFuZCBjYWxsYmFjayBgZm4ocmVzKWAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVybFxuICogQHBhcmFtIHtNaXhlZH0gW2RhdGFdXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBbZm5dXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5yZXF1ZXN0LnBvc3QgPSAodXJsLCBkYXRhLCBmbikgPT4ge1xuICBjb25zdCByZXF1ZXN0XyA9IHJlcXVlc3QoJ1BPU1QnLCB1cmwpO1xuICBpZiAodHlwZW9mIGRhdGEgPT09ICdmdW5jdGlvbicpIHtcbiAgICBmbiA9IGRhdGE7XG4gICAgZGF0YSA9IG51bGw7XG4gIH1cblxuICBpZiAoZGF0YSkgcmVxdWVzdF8uc2VuZChkYXRhKTtcbiAgaWYgKGZuKSByZXF1ZXN0Xy5lbmQoZm4pO1xuICByZXR1cm4gcmVxdWVzdF87XG59O1xuXG4vKipcbiAqIFBVVCBgdXJsYCB3aXRoIG9wdGlvbmFsIGBkYXRhYCBhbmQgY2FsbGJhY2sgYGZuKHJlcylgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmxcbiAqIEBwYXJhbSB7TWl4ZWR8RnVuY3Rpb259IFtkYXRhXSBvciBmblxuICogQHBhcmFtIHtGdW5jdGlvbn0gW2ZuXVxuICogQHJldHVybiB7UmVxdWVzdH1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxucmVxdWVzdC5wdXQgPSAodXJsLCBkYXRhLCBmbikgPT4ge1xuICBjb25zdCByZXF1ZXN0XyA9IHJlcXVlc3QoJ1BVVCcsIHVybCk7XG4gIGlmICh0eXBlb2YgZGF0YSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIGZuID0gZGF0YTtcbiAgICBkYXRhID0gbnVsbDtcbiAgfVxuXG4gIGlmIChkYXRhKSByZXF1ZXN0Xy5zZW5kKGRhdGEpO1xuICBpZiAoZm4pIHJlcXVlc3RfLmVuZChmbik7XG4gIHJldHVybiByZXF1ZXN0Xztcbn07XG4iXSwibWFw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