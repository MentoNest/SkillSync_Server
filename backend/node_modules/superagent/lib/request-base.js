"use strict";

/**
 * Module of mixed-in functions shared between node and client code
 */
const {
  isObject,
  hasOwn,
  isSafeKey
} = require('./utils');

/**
 * Expose `RequestBase`.
 */

module.exports = RequestBase;

/**
 * Initialize a new `RequestBase`.
 *
 * @api public
 */

function RequestBase() {}

/**
 * Clear previous timeout.
 *
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.clearTimeout = function () {
  clearTimeout(this._timer);
  clearTimeout(this._responseTimeoutTimer);
  clearTimeout(this._uploadTimeoutTimer);
  delete this._timer;
  delete this._responseTimeoutTimer;
  delete this._uploadTimeoutTimer;
  return this;
};

/**
 * Override default response body parser
 *
 * This function will be called to convert incoming data into request.body
 *
 * @param {Function}
 * @api public
 */

RequestBase.prototype.parse = function (fn) {
  this._parser = fn;
  return this;
};

/**
 * Set format of binary response body.
 * In browser valid formats are 'blob' and 'arraybuffer',
 * which return Blob and ArrayBuffer, respectively.
 *
 * In Node all values result in Buffer.
 *
 * Examples:
 *
 *      req.get('/')
 *        .responseType('blob')
 *        .end(callback);
 *
 * @param {String} val
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.responseType = function (value) {
  this._responseType = value;
  return this;
};

/**
 * Override default request body serializer
 *
 * This function will be called to convert data set via .send or .attach into payload to send
 *
 * @param {Function}
 * @api public
 */

RequestBase.prototype.serialize = function (fn) {
  this._serializer = fn;
  return this;
};

/**
 * Set timeouts.
 *
 * - response timeout is time between sending request and receiving the first byte of the response. Includes DNS and connection time.
 * - deadline is the time from start of the request to receiving response body in full. If the deadline is too short large files may not load at all on slow connections.
 * - upload is the time  since last bit of data was sent or received. This timeout works only if deadline timeout is off
 *
 * Value of 0 or false means no timeout.
 *
 * @param {Number|Object} ms or {response, deadline}
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.timeout = function (options) {
  if (!options || typeof options !== 'object') {
    this._timeout = options;
    this._responseTimeout = 0;
    this._uploadTimeout = 0;
    return this;
  }
  for (const option in options) {
    if (hasOwn(options, option)) {
      switch (option) {
        case 'deadline':
          this._timeout = options.deadline;
          break;
        case 'response':
          this._responseTimeout = options.response;
          break;
        case 'upload':
          this._uploadTimeout = options.upload;
          break;
        default:
          console.warn('Unknown timeout option', option);
      }
    }
  }
  return this;
};

/**
 * Set number of retry attempts on error.
 *
 * Failed requests will be retried 'count' times if timeout or err.code >= 500.
 *
 * @param {Number} count
 * @param {Function} [fn]
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.retry = function (count, fn) {
  // Default to 1 if no count passed or true
  if (arguments.length === 0 || count === true) count = 1;
  if (count <= 0) count = 0;
  this._maxRetries = count;
  this._retries = 0;
  this._retryCallback = fn;
  return this;
};

//
// NOTE: we do not include ESOCKETTIMEDOUT because that is from `request` package
//       <https://github.com/sindresorhus/got/pull/537>
//
// NOTE: we do not include EADDRINFO because it was removed from libuv in 2014
//       <https://github.com/libuv/libuv/commit/02e1ebd40b807be5af46343ea873331b2ee4e9c1>
//       <https://github.com/request/request/search?q=ESOCKETTIMEDOUT&unscoped_q=ESOCKETTIMEDOUT>
//
//
// TODO: expose these as configurable defaults
//
const ERROR_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'EADDRINUSE', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND', 'ENETUNREACH', 'EAI_AGAIN']);
const STATUS_CODES = new Set([408, 413, 429, 500, 502, 503, 504, 521, 522, 524]);

// TODO: we would need to make this easily configurable before adding it in (e.g. some might want to add POST)
// const METHODS = new Set(['GET', 'PUT', 'HEAD', 'DELETE', 'OPTIONS', 'TRACE']);

/**
 * Determine if a request should be retried.
 * (Inspired by https://github.com/sindresorhus/got#retry)
 *
 * @param {Error} err an error
 * @param {Response} [res] response
 * @returns {Boolean} if segment should be retried
 */
RequestBase.prototype._shouldRetry = function (error, res) {
  if (!this._maxRetries || this._retries++ >= this._maxRetries) {
    return false;
  }
  if (this._retryCallback) {
    try {
      const override = this._retryCallback(error, res);
      if (override === true) return true;
      if (override === false) return false;
      // undefined falls back to defaults
    } catch (err) {
      console.error(err);
    }
  }

  // TODO: we would need to make this easily configurable before adding it in (e.g. some might want to add POST)
  /*
  if (
    this.req &&
    this.req.method &&
    !METHODS.has(this.req.method.toUpperCase())
  )
    return false;
  */
  if (res && res.status && STATUS_CODES.has(res.status)) return true;
  if (error) {
    if (error.code && ERROR_CODES.has(error.code)) return true;
    // Superagent timeout
    if (error.timeout && error.code === 'ECONNABORTED') return true;
    if (error.crossDomain) return true;
  }
  return false;
};

/**
 * Retry request
 *
 * @return {Request} for chaining
 * @api private
 */

RequestBase.prototype._retry = function () {
  this.clearTimeout();

  // node
  if (this.req) {
    this.req = null;
    this.req = this.request();
  }
  this._aborted = false;
  this.timedout = false;
  this.timedoutError = null;
  return this._end();
};

/**
 * Promise support
 *
 * @param {Function} resolve
 * @param {Function} [reject]
 * @return {Request}
 */

RequestBase.prototype.then = function (resolve, reject) {
  if (!this._fullfilledPromise) {
    const self = this;
    if (this._endCalled) {
      console.warn('Warning: superagent request was sent twice, because both .end() and .then() were called. Never call .end() if you use promises');
    }
    this._fullfilledPromise = new Promise((resolve, reject) => {
      self.on('abort', () => {
        // Timeouts abort the current attempt before retrying; an explicit
        // abort must still reject even when attempts remain.
        if (this.timedout && this._maxRetries && this._maxRetries > this._retries) {
          return;
        }
        if (this.timedout && this.timedoutError) {
          reject(this.timedoutError);
          return;
        }
        const error = new Error('Aborted');
        error.code = 'ABORTED';
        error.status = this.status;
        error.method = this.method;
        error.url = this.url;
        reject(error);
      });
      self.end((error, res) => {
        if (error) reject(error);else resolve(res);
      });
    });
  }
  return this._fullfilledPromise.then(resolve, reject);
};
RequestBase.prototype.catch = function (callback) {
  return this.then(undefined, callback);
};

/**
 * Allow for extension
 */

RequestBase.prototype.use = function (fn) {
  fn(this);
  return this;
};
RequestBase.prototype.ok = function (callback) {
  if (typeof callback !== 'function') throw new Error('Callback required');
  this._okCallback = callback;
  return this;
};
RequestBase.prototype._isResponseOK = function (res) {
  if (!res) {
    return false;
  }
  if (this._okCallback) {
    return this._okCallback(res);
  }
  return res.status >= 200 && res.status < 300;
};

/**
 * Get request header `field`.
 * Case-insensitive.
 *
 * @param {String} field
 * @return {String}
 * @api public
 */

RequestBase.prototype.get = function (field) {
  return this._header[field.toLowerCase()];
};

/**
 * Get case-insensitive header `field` value.
 * This is a deprecated internal API. Use `.get(field)` instead.
 *
 * (getHeader is no longer used internally by the superagent code base)
 *
 * @param {String} field
 * @return {String}
 * @api private
 * @deprecated
 */

RequestBase.prototype.getHeader = RequestBase.prototype.get;

/**
 * Set header `field` to `val`, or multiple fields with one object.
 * Case-insensitive.
 *
 * Examples:
 *
 *      req.get('/')
 *        .set('Accept', 'application/json')
 *        .set('X-API-Key', 'foobar')
 *        .end(callback);
 *
 *      req.get('/')
 *        .set({ Accept: 'application/json', 'X-API-Key': 'foobar' })
 *        .end(callback);
 *
 * @param {String|Object} field
 * @param {String} val
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.set = function (field, value) {
  if (isObject(field)) {
    for (const key in field) {
      if (hasOwn(field, key)) this.set(key, field[key]);
    }
    return this;
  }
  this._header[field.toLowerCase()] = value;
  this.header[field] = value;
  return this;
};

/**
 * Remove header `field`.
 * Case-insensitive.
 *
 * Example:
 *
 *      req.get('/')
 *        .unset('User-Agent')
 *        .end(callback);
 *
 * @param {String} field field name
 */
RequestBase.prototype.unset = function (field) {
  delete this._header[field.toLowerCase()];
  delete this.header[field];
  return this;
};

/**
 * Write the field `name` and `val`, or multiple fields with one object
 * for "multipart/form-data" request bodies.
 *
 * ``` js
 * request.post('/upload')
 *   .field('foo', 'bar')
 *   .end(callback);
 *
 * request.post('/upload')
 *   .field({ foo: 'bar', baz: 'qux' })
 *   .end(callback);
 * ```
 *
 * @param {String|Object} name name of field
 * @param {String|Blob|File|Buffer|fs.ReadStream} val value of field
 * @param {String} options extra options, e.g. 'blob'
 * @return {Request} for chaining
 * @api public
 */
RequestBase.prototype.field = function (name, value, options) {
  // name should be either a string or an object.
  if (name === null || undefined === name) {
    throw new Error('.field(name, val) name can not be empty');
  }
  if (this._data) {
    throw new Error(".field() can't be used if .send() is used. Please use only .send() or only .field() & .attach()");
  }
  if (isObject(name)) {
    for (const key in name) {
      if (hasOwn(name, key)) this.field(key, name[key]);
    }
    return this;
  }
  if (Array.isArray(value)) {
    for (const i in value) {
      if (hasOwn(value, i)) this.field(name, value[i]);
    }
    return this;
  }

  // val should be defined now
  if (value === null || undefined === value) {
    throw new Error('.field(name, val) val can not be empty');
  }
  if (typeof value === 'boolean') {
    value = String(value);
  }

  // fix https://github.com/ladjs/superagent/issues/1680
  if (options) this._getFormData().append(name, value, options);else this._getFormData().append(name, value);
  return this;
};

/**
 * Abort the request, and clear potential timeout.
 *
 * @return {Request} request
 * @api public
 */
RequestBase.prototype.abort = function () {
  if (this._aborted) {
    return this;
  }
  this._aborted = true;
  if (this.xhr) this.xhr.abort(); // browser
  if (this.req) {
    this.req.abort(); // node
  }
  this.clearTimeout();
  this.emit('abort');
  return this;
};
RequestBase.prototype._auth = function (user, pass, options, base64Encoder) {
  switch (options.type) {
    case 'basic':
      this.set('Authorization', `Basic ${base64Encoder(`${user}:${pass}`)}`);
      break;
    case 'auto':
      this.username = user;
      this.password = pass;
      break;
    case 'bearer':
      // usage would be .auth(accessToken, { type: 'bearer' })
      this.set('Authorization', `Bearer ${user}`);
      break;
    default:
      break;
  }
  return this;
};

/**
 * Enable transmission of cookies with x-domain requests.
 *
 * Note that for this to work the origin must not be
 * using "Access-Control-Allow-Origin" with a wildcard,
 * and also must set "Access-Control-Allow-Credentials"
 * to "true".
 * @param {Boolean} [on=true] - Set 'withCredentials' state
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.withCredentials = function (on) {
  // This is browser-only functionality. Node side is no-op.
  if (on === undefined) on = true;
  this._withCredentials = on;
  return this;
};

/**
 * Set the max redirects to `n`. Does nothing in browser XHR implementation.
 *
 * @param {Number} n
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.redirects = function (n) {
  this._maxRedirects = n;
  return this;
};

/**
 * Maximum size of buffered response body, in bytes. Counts uncompressed size.
 * Default 200MB.
 *
 * @param {Number} n number of bytes
 * @return {Request} for chaining
 */
RequestBase.prototype.maxResponseSize = function (n) {
  if (typeof n !== 'number') {
    throw new TypeError('Invalid argument');
  }
  this._maxResponseSize = n;
  return this;
};

/**
 * Convert to a plain javascript object (not JSON string) of scalar properties.
 * Note as this method is designed to return a useful non-this value,
 * it cannot be chained.
 *
 * @return {Object} describing method, url, and data of this request
 * @api public
 */

RequestBase.prototype.toJSON = function () {
  return {
    method: this.method,
    url: this.url,
    data: this._data,
    headers: this._header
  };
};

/**
 * Send `data` as the request body, defaulting the `.type()` to "json" when
 * an object is given.
 *
 * Examples:
 *
 *       // manual json
 *       request.post('/user')
 *         .type('json')
 *         .send('{"name":"tj"}')
 *         .end(callback)
 *
 *       // auto json
 *       request.post('/user')
 *         .send({ name: 'tj' })
 *         .end(callback)
 *
 *       // manual x-www-form-urlencoded
 *       request.post('/user')
 *         .type('form')
 *         .send('name=tj')
 *         .end(callback)
 *
 *       // auto x-www-form-urlencoded
 *       request.post('/user')
 *         .type('form')
 *         .send({ name: 'tj' })
 *         .end(callback)
 *
 *       // defaults to x-www-form-urlencoded
 *      request.post('/user')
 *        .send('name=tobi')
 *        .send('species=ferret')
 *        .end(callback)
 *
 * @param {String|Object} data
 * @return {Request} for chaining
 * @api public
 */

// eslint-disable-next-line complexity
RequestBase.prototype.send = function (data) {
  const isObject_ = isObject(data);
  let type = this._header['content-type'];
  if (this._formData) {
    throw new Error(".send() can't be used if .attach() or .field() is used. Please use only .send() or only .field() & .attach()");
  }
  if (isObject_ && !this._data) {
    if (Array.isArray(data)) {
      this._data = [];
    } else if (!this._isHost(data)) {
      this._data = {};
    }
  } else if (data && this._data && this._isHost(this._data)) {
    throw new Error("Can't merge these send calls");
  }

  // merge
  if (isObject_ && isObject(this._data)) {
    for (const key in data) {
      if (typeof data[key] == 'bigint' && !data[key].toJSON) throw new Error('Cannot serialize BigInt value to json');
      if (!hasOwn(data, key)) continue;
      if (isSafeKey(key)) {
        this._data[key] = data[key];
      } else {
        // an own "__proto__" key (e.g. from JSON.parse of untrusted input)
        // must become a plain own property of the payload rather than
        // replacing the payload's prototype and vanishing from the body
        Object.defineProperty(this._data, key, {
          value: data[key],
          enumerable: true,
          writable: true,
          configurable: true
        });
      }
    }
  } else if (typeof data === 'bigint') throw new Error("Cannot send value of type BigInt");else if (typeof data === 'string') {
    // default to x-www-form-urlencoded
    if (!type) this.type('form');
    type = this._header['content-type'];
    if (type) type = type.toLowerCase().trim();
    if (type === 'application/x-www-form-urlencoded') {
      this._data = this._data ? `${this._data}&${data}` : data;
    } else {
      this._data = (this._data || '') + data;
    }
  } else {
    this._data = data;
  }
  if (!isObject_ || this._isHost(data)) {
    return this;
  }

  // default to json
  if (!type) this.type('json');
  return this;
};

/**
 * Sort `querystring` by the sort function
 *
 *
 * Examples:
 *
 *       // default order
 *       request.get('/user')
 *         .query('name=Nick')
 *         .query('search=Manny')
 *         .sortQuery()
 *         .end(callback)
 *
 *       // customized sort function
 *       request.get('/user')
 *         .query('name=Nick')
 *         .query('search=Manny')
 *         .sortQuery(function(a, b){
 *           return a.length - b.length;
 *         })
 *         .end(callback)
 *
 *
 * @param {Function} sort
 * @return {Request} for chaining
 * @api public
 */

RequestBase.prototype.sortQuery = function (sort) {
  // _sort default to true but otherwise can be a function or boolean
  this._sort = typeof sort === 'undefined' ? true : sort;
  return this;
};

/**
 * Compose querystring to append to req.url
 *
 * @api private
 */
RequestBase.prototype._finalizeQueryString = function () {
  const query = this._query.join('&');
  if (query) {
    this.url += (this.url.includes('?') ? '&' : '?') + query;
  }
  this._query.length = 0; // Makes the call idempotent

  if (this._sort) {
    const index = this.url.indexOf('?');
    if (index >= 0) {
      const queryArray = this.url.slice(index + 1).split('&');
      if (typeof this._sort === 'function') {
        queryArray.sort(this._sort);
      } else {
        queryArray.sort();
      }
      this.url = this.url.slice(0, index) + '?' + queryArray.join('&');
    }
  }
};

// For backwards compat only
RequestBase.prototype._appendQueryString = () => {
  console.warn('Unsupported');
};

/**
 * Invoke callback with timeout error.
 *
 * @api private
 */

RequestBase.prototype._timeoutError = function (reason, timeout, errno) {
  if (this._aborted) {
    return;
  }
  const error = new Error(`${reason + timeout}ms exceeded`);
  error.timeout = timeout;
  error.code = 'ECONNABORTED';
  error.errno = errno;
  this.timedout = true;
  this.timedoutError = error;
  this.abort();
  this.callback(error);
};
RequestBase.prototype._setTimeouts = function () {
  const self = this;

  // deadline
  if (this._timeout && !this._timer) {
    this._timer = setTimeout(() => {
      self._timeoutError('Timeout of ', self._timeout, 'ETIME');
    }, this._timeout);
  }

  // response timeout
  if (this._responseTimeout && !this._responseTimeoutTimer) {
    this._responseTimeoutTimer = setTimeout(() => {
      self._timeoutError('Response timeout of ', self._responseTimeout, 'ETIMEDOUT');
    }, this._responseTimeout);
  }
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJpc09iamVjdCIsImhhc093biIsImlzU2FmZUtleSIsInJlcXVpcmUiLCJtb2R1bGUiLCJleHBvcnRzIiwiUmVxdWVzdEJhc2UiLCJwcm90b3R5cGUiLCJjbGVhclRpbWVvdXQiLCJfdGltZXIiLCJfcmVzcG9uc2VUaW1lb3V0VGltZXIiLCJfdXBsb2FkVGltZW91dFRpbWVyIiwicGFyc2UiLCJmbiIsIl9wYXJzZXIiLCJyZXNwb25zZVR5cGUiLCJ2YWx1ZSIsIl9yZXNwb25zZVR5cGUiLCJzZXJpYWxpemUiLCJfc2VyaWFsaXplciIsInRpbWVvdXQiLCJvcHRpb25zIiwiX3RpbWVvdXQiLCJfcmVzcG9uc2VUaW1lb3V0IiwiX3VwbG9hZFRpbWVvdXQiLCJvcHRpb24iLCJkZWFkbGluZSIsInJlc3BvbnNlIiwidXBsb2FkIiwiY29uc29sZSIsIndhcm4iLCJyZXRyeSIsImNvdW50IiwiYXJndW1lbnRzIiwibGVuZ3RoIiwiX21heFJldHJpZXMiLCJfcmV0cmllcyIsIl9yZXRyeUNhbGxiYWNrIiwiRVJST1JfQ09ERVMiLCJTZXQiLCJTVEFUVVNfQ09ERVMiLCJfc2hvdWxkUmV0cnkiLCJlcnJvciIsInJlcyIsIm92ZXJyaWRlIiwiZXJyIiwic3RhdHVzIiwiaGFzIiwiY29kZSIsImNyb3NzRG9tYWluIiwiX3JldHJ5IiwicmVxIiwicmVxdWVzdCIsIl9hYm9ydGVkIiwidGltZWRvdXQiLCJ0aW1lZG91dEVycm9yIiwiX2VuZCIsInRoZW4iLCJyZXNvbHZlIiwicmVqZWN0IiwiX2Z1bGxmaWxsZWRQcm9taXNlIiwic2VsZiIsIl9lbmRDYWxsZWQiLCJQcm9taXNlIiwib24iLCJFcnJvciIsIm1ldGhvZCIsInVybCIsImVuZCIsImNhdGNoIiwiY2FsbGJhY2siLCJ1bmRlZmluZWQiLCJ1c2UiLCJvayIsIl9va0NhbGxiYWNrIiwiX2lzUmVzcG9uc2VPSyIsImdldCIsImZpZWxkIiwiX2hlYWRlciIsInRvTG93ZXJDYXNlIiwiZ2V0SGVhZGVyIiwic2V0Iiwia2V5IiwiaGVhZGVyIiwidW5zZXQiLCJuYW1lIiwiX2RhdGEiLCJBcnJheSIsImlzQXJyYXkiLCJpIiwiU3RyaW5nIiwiX2dldEZvcm1EYXRhIiwiYXBwZW5kIiwiYWJvcnQiLCJ4aHIiLCJlbWl0IiwiX2F1dGgiLCJ1c2VyIiwicGFzcyIsImJhc2U2NEVuY29kZXIiLCJ0eXBlIiwidXNlcm5hbWUiLCJwYXNzd29yZCIsIndpdGhDcmVkZW50aWFscyIsIl93aXRoQ3JlZGVudGlhbHMiLCJyZWRpcmVjdHMiLCJuIiwiX21heFJlZGlyZWN0cyIsIm1heFJlc3BvbnNlU2l6ZSIsIlR5cGVFcnJvciIsIl9tYXhSZXNwb25zZVNpemUiLCJ0b0pTT04iLCJkYXRhIiwiaGVhZGVycyIsInNlbmQiLCJpc09iamVjdF8iLCJfZm9ybURhdGEiLCJfaXNIb3N0IiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJlbnVtZXJhYmxlIiwid3JpdGFibGUiLCJjb25maWd1cmFibGUiLCJ0cmltIiwic29ydFF1ZXJ5Iiwic29ydCIsIl9zb3J0IiwiX2ZpbmFsaXplUXVlcnlTdHJpbmciLCJxdWVyeSIsIl9xdWVyeSIsImpvaW4iLCJpbmNsdWRlcyIsImluZGV4IiwiaW5kZXhPZiIsInF1ZXJ5QXJyYXkiLCJzbGljZSIsInNwbGl0IiwiX2FwcGVuZFF1ZXJ5U3RyaW5nIiwiX3RpbWVvdXRFcnJvciIsInJlYXNvbiIsImVycm5vIiwiX3NldFRpbWVvdXRzIiwic2V0VGltZW91dCJdLCJzb3VyY2VzIjpbIi4uL3NyYy9yZXF1ZXN0LWJhc2UuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBNb2R1bGUgb2YgbWl4ZWQtaW4gZnVuY3Rpb25zIHNoYXJlZCBiZXR3ZWVuIG5vZGUgYW5kIGNsaWVudCBjb2RlXG4gKi9cbmNvbnN0IHsgaXNPYmplY3QsIGhhc093biwgaXNTYWZlS2V5IH0gPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbi8qKlxuICogRXhwb3NlIGBSZXF1ZXN0QmFzZWAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBSZXF1ZXN0QmFzZTtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBSZXF1ZXN0QmFzZWAuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBSZXF1ZXN0QmFzZSgpIHt9XG5cbi8qKlxuICogQ2xlYXIgcHJldmlvdXMgdGltZW91dC5cbiAqXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdEJhc2UucHJvdG90eXBlLmNsZWFyVGltZW91dCA9IGZ1bmN0aW9uICgpIHtcbiAgY2xlYXJUaW1lb3V0KHRoaXMuX3RpbWVyKTtcbiAgY2xlYXJUaW1lb3V0KHRoaXMuX3Jlc3BvbnNlVGltZW91dFRpbWVyKTtcbiAgY2xlYXJUaW1lb3V0KHRoaXMuX3VwbG9hZFRpbWVvdXRUaW1lcik7XG4gIGRlbGV0ZSB0aGlzLl90aW1lcjtcbiAgZGVsZXRlIHRoaXMuX3Jlc3BvbnNlVGltZW91dFRpbWVyO1xuICBkZWxldGUgdGhpcy5fdXBsb2FkVGltZW91dFRpbWVyO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogT3ZlcnJpZGUgZGVmYXVsdCByZXNwb25zZSBib2R5IHBhcnNlclxuICpcbiAqIFRoaXMgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgdG8gY29udmVydCBpbmNvbWluZyBkYXRhIGludG8gcmVxdWVzdC5ib2R5XG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdEJhc2UucHJvdG90eXBlLnBhcnNlID0gZnVuY3Rpb24gKGZuKSB7XG4gIHRoaXMuX3BhcnNlciA9IGZuO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IGZvcm1hdCBvZiBiaW5hcnkgcmVzcG9uc2UgYm9keS5cbiAqIEluIGJyb3dzZXIgdmFsaWQgZm9ybWF0cyBhcmUgJ2Jsb2InIGFuZCAnYXJyYXlidWZmZXInLFxuICogd2hpY2ggcmV0dXJuIEJsb2IgYW5kIEFycmF5QnVmZmVyLCByZXNwZWN0aXZlbHkuXG4gKlxuICogSW4gTm9kZSBhbGwgdmFsdWVzIHJlc3VsdCBpbiBCdWZmZXIuXG4gKlxuICogRXhhbXBsZXM6XG4gKlxuICogICAgICByZXEuZ2V0KCcvJylcbiAqICAgICAgICAucmVzcG9uc2VUeXBlKCdibG9iJylcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKTtcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdmFsXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdEJhc2UucHJvdG90eXBlLnJlc3BvbnNlVHlwZSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICB0aGlzLl9yZXNwb25zZVR5cGUgPSB2YWx1ZTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIE92ZXJyaWRlIGRlZmF1bHQgcmVxdWVzdCBib2R5IHNlcmlhbGl6ZXJcbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIHdpbGwgYmUgY2FsbGVkIHRvIGNvbnZlcnQgZGF0YSBzZXQgdmlhIC5zZW5kIG9yIC5hdHRhY2ggaW50byBwYXlsb2FkIHRvIHNlbmRcbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0QmFzZS5wcm90b3R5cGUuc2VyaWFsaXplID0gZnVuY3Rpb24gKGZuKSB7XG4gIHRoaXMuX3NlcmlhbGl6ZXIgPSBmbjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNldCB0aW1lb3V0cy5cbiAqXG4gKiAtIHJlc3BvbnNlIHRpbWVvdXQgaXMgdGltZSBiZXR3ZWVuIHNlbmRpbmcgcmVxdWVzdCBhbmQgcmVjZWl2aW5nIHRoZSBmaXJzdCBieXRlIG9mIHRoZSByZXNwb25zZS4gSW5jbHVkZXMgRE5TIGFuZCBjb25uZWN0aW9uIHRpbWUuXG4gKiAtIGRlYWRsaW5lIGlzIHRoZSB0aW1lIGZyb20gc3RhcnQgb2YgdGhlIHJlcXVlc3QgdG8gcmVjZWl2aW5nIHJlc3BvbnNlIGJvZHkgaW4gZnVsbC4gSWYgdGhlIGRlYWRsaW5lIGlzIHRvbyBzaG9ydCBsYXJnZSBmaWxlcyBtYXkgbm90IGxvYWQgYXQgYWxsIG9uIHNsb3cgY29ubmVjdGlvbnMuXG4gKiAtIHVwbG9hZCBpcyB0aGUgdGltZSAgc2luY2UgbGFzdCBiaXQgb2YgZGF0YSB3YXMgc2VudCBvciByZWNlaXZlZC4gVGhpcyB0aW1lb3V0IHdvcmtzIG9ubHkgaWYgZGVhZGxpbmUgdGltZW91dCBpcyBvZmZcbiAqXG4gKiBWYWx1ZSBvZiAwIG9yIGZhbHNlIG1lYW5zIG5vIHRpbWVvdXQuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ8T2JqZWN0fSBtcyBvciB7cmVzcG9uc2UsIGRlYWRsaW5lfVxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3RCYXNlLnByb3RvdHlwZS50aW1lb3V0ID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgaWYgKCFvcHRpb25zIHx8IHR5cGVvZiBvcHRpb25zICE9PSAnb2JqZWN0Jykge1xuICAgIHRoaXMuX3RpbWVvdXQgPSBvcHRpb25zO1xuICAgIHRoaXMuX3Jlc3BvbnNlVGltZW91dCA9IDA7XG4gICAgdGhpcy5fdXBsb2FkVGltZW91dCA9IDA7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBmb3IgKGNvbnN0IG9wdGlvbiBpbiBvcHRpb25zKSB7XG4gICAgaWYgKGhhc093bihvcHRpb25zLCBvcHRpb24pKSB7XG4gICAgICBzd2l0Y2ggKG9wdGlvbikge1xuICAgICAgICBjYXNlICdkZWFkbGluZSc6XG4gICAgICAgICAgdGhpcy5fdGltZW91dCA9IG9wdGlvbnMuZGVhZGxpbmU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3Jlc3BvbnNlJzpcbiAgICAgICAgICB0aGlzLl9yZXNwb25zZVRpbWVvdXQgPSBvcHRpb25zLnJlc3BvbnNlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd1cGxvYWQnOlxuICAgICAgICAgIHRoaXMuX3VwbG9hZFRpbWVvdXQgPSBvcHRpb25zLnVwbG9hZDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBjb25zb2xlLndhcm4oJ1Vua25vd24gdGltZW91dCBvcHRpb24nLCBvcHRpb24pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgbnVtYmVyIG9mIHJldHJ5IGF0dGVtcHRzIG9uIGVycm9yLlxuICpcbiAqIEZhaWxlZCByZXF1ZXN0cyB3aWxsIGJlIHJldHJpZWQgJ2NvdW50JyB0aW1lcyBpZiB0aW1lb3V0IG9yIGVyci5jb2RlID49IDUwMC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gY291bnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IFtmbl1cbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0QmFzZS5wcm90b3R5cGUucmV0cnkgPSBmdW5jdGlvbiAoY291bnQsIGZuKSB7XG4gIC8vIERlZmF1bHQgdG8gMSBpZiBubyBjb3VudCBwYXNzZWQgb3IgdHJ1ZVxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCB8fCBjb3VudCA9PT0gdHJ1ZSkgY291bnQgPSAxO1xuICBpZiAoY291bnQgPD0gMCkgY291bnQgPSAwO1xuICB0aGlzLl9tYXhSZXRyaWVzID0gY291bnQ7XG4gIHRoaXMuX3JldHJpZXMgPSAwO1xuICB0aGlzLl9yZXRyeUNhbGxiYWNrID0gZm47XG4gIHJldHVybiB0aGlzO1xufTtcblxuLy9cbi8vIE5PVEU6IHdlIGRvIG5vdCBpbmNsdWRlIEVTT0NLRVRUSU1FRE9VVCBiZWNhdXNlIHRoYXQgaXMgZnJvbSBgcmVxdWVzdGAgcGFja2FnZVxuLy8gICAgICAgPGh0dHBzOi8vZ2l0aHViLmNvbS9zaW5kcmVzb3JodXMvZ290L3B1bGwvNTM3PlxuLy9cbi8vIE5PVEU6IHdlIGRvIG5vdCBpbmNsdWRlIEVBRERSSU5GTyBiZWNhdXNlIGl0IHdhcyByZW1vdmVkIGZyb20gbGlidXYgaW4gMjAxNFxuLy8gICAgICAgPGh0dHBzOi8vZ2l0aHViLmNvbS9saWJ1di9saWJ1di9jb21taXQvMDJlMWViZDQwYjgwN2JlNWFmNDYzNDNlYTg3MzMzMWIyZWU0ZTljMT5cbi8vICAgICAgIDxodHRwczovL2dpdGh1Yi5jb20vcmVxdWVzdC9yZXF1ZXN0L3NlYXJjaD9xPUVTT0NLRVRUSU1FRE9VVCZ1bnNjb3BlZF9xPUVTT0NLRVRUSU1FRE9VVD5cbi8vXG4vL1xuLy8gVE9ETzogZXhwb3NlIHRoZXNlIGFzIGNvbmZpZ3VyYWJsZSBkZWZhdWx0c1xuLy9cbmNvbnN0IEVSUk9SX0NPREVTID0gbmV3IFNldChbXG4gICdFVElNRURPVVQnLFxuICAnRUNPTk5SRVNFVCcsXG4gICdFQUREUklOVVNFJyxcbiAgJ0VDT05OUkVGVVNFRCcsXG4gICdFUElQRScsXG4gICdFTk9URk9VTkQnLFxuICAnRU5FVFVOUkVBQ0gnLFxuICAnRUFJX0FHQUlOJ1xuXSk7XG5cbmNvbnN0IFNUQVRVU19DT0RFUyA9IG5ldyBTZXQoW1xuICA0MDgsIDQxMywgNDI5LCA1MDAsIDUwMiwgNTAzLCA1MDQsIDUyMSwgNTIyLCA1MjRcbl0pO1xuXG4vLyBUT0RPOiB3ZSB3b3VsZCBuZWVkIHRvIG1ha2UgdGhpcyBlYXNpbHkgY29uZmlndXJhYmxlIGJlZm9yZSBhZGRpbmcgaXQgaW4gKGUuZy4gc29tZSBtaWdodCB3YW50IHRvIGFkZCBQT1NUKVxuLy8gY29uc3QgTUVUSE9EUyA9IG5ldyBTZXQoWydHRVQnLCAnUFVUJywgJ0hFQUQnLCAnREVMRVRFJywgJ09QVElPTlMnLCAnVFJBQ0UnXSk7XG5cbi8qKlxuICogRGV0ZXJtaW5lIGlmIGEgcmVxdWVzdCBzaG91bGQgYmUgcmV0cmllZC5cbiAqIChJbnNwaXJlZCBieSBodHRwczovL2dpdGh1Yi5jb20vc2luZHJlc29yaHVzL2dvdCNyZXRyeSlcbiAqXG4gKiBAcGFyYW0ge0Vycm9yfSBlcnIgYW4gZXJyb3JcbiAqIEBwYXJhbSB7UmVzcG9uc2V9IFtyZXNdIHJlc3BvbnNlXG4gKiBAcmV0dXJucyB7Qm9vbGVhbn0gaWYgc2VnbWVudCBzaG91bGQgYmUgcmV0cmllZFxuICovXG5SZXF1ZXN0QmFzZS5wcm90b3R5cGUuX3Nob3VsZFJldHJ5ID0gZnVuY3Rpb24gKGVycm9yLCByZXMpIHtcbiAgaWYgKCF0aGlzLl9tYXhSZXRyaWVzIHx8IHRoaXMuX3JldHJpZXMrKyA+PSB0aGlzLl9tYXhSZXRyaWVzKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKHRoaXMuX3JldHJ5Q2FsbGJhY2spIHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgb3ZlcnJpZGUgPSB0aGlzLl9yZXRyeUNhbGxiYWNrKGVycm9yLCByZXMpO1xuICAgICAgaWYgKG92ZXJyaWRlID09PSB0cnVlKSByZXR1cm4gdHJ1ZTtcbiAgICAgIGlmIChvdmVycmlkZSA9PT0gZmFsc2UpIHJldHVybiBmYWxzZTtcbiAgICAgIC8vIHVuZGVmaW5lZCBmYWxscyBiYWNrIHRvIGRlZmF1bHRzXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGVycik7XG4gICAgfVxuICB9XG5cbiAgLy8gVE9ETzogd2Ugd291bGQgbmVlZCB0byBtYWtlIHRoaXMgZWFzaWx5IGNvbmZpZ3VyYWJsZSBiZWZvcmUgYWRkaW5nIGl0IGluIChlLmcuIHNvbWUgbWlnaHQgd2FudCB0byBhZGQgUE9TVClcbiAgLypcbiAgaWYgKFxuICAgIHRoaXMucmVxICYmXG4gICAgdGhpcy5yZXEubWV0aG9kICYmXG4gICAgIU1FVEhPRFMuaGFzKHRoaXMucmVxLm1ldGhvZC50b1VwcGVyQ2FzZSgpKVxuICApXG4gICAgcmV0dXJuIGZhbHNlO1xuICAqL1xuICBpZiAocmVzICYmIHJlcy5zdGF0dXMgJiYgU1RBVFVTX0NPREVTLmhhcyhyZXMuc3RhdHVzKSkgcmV0dXJuIHRydWU7XG4gIGlmIChlcnJvcikge1xuICAgIGlmIChlcnJvci5jb2RlICYmIEVSUk9SX0NPREVTLmhhcyhlcnJvci5jb2RlKSkgcmV0dXJuIHRydWU7XG4gICAgLy8gU3VwZXJhZ2VudCB0aW1lb3V0XG4gICAgaWYgKGVycm9yLnRpbWVvdXQgJiYgZXJyb3IuY29kZSA9PT0gJ0VDT05OQUJPUlRFRCcpIHJldHVybiB0cnVlO1xuICAgIGlmIChlcnJvci5jcm9zc0RvbWFpbikgcmV0dXJuIHRydWU7XG4gIH1cblxuICByZXR1cm4gZmFsc2U7XG59O1xuXG4vKipcbiAqIFJldHJ5IHJlcXVlc3RcbiAqXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cblJlcXVlc3RCYXNlLnByb3RvdHlwZS5fcmV0cnkgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuY2xlYXJUaW1lb3V0KCk7XG5cbiAgLy8gbm9kZVxuICBpZiAodGhpcy5yZXEpIHtcbiAgICB0aGlzLnJlcSA9IG51bGw7XG4gICAgdGhpcy5yZXEgPSB0aGlzLnJlcXVlc3QoKTtcbiAgfVxuXG4gIHRoaXMuX2Fib3J0ZWQgPSBmYWxzZTtcbiAgdGhpcy50aW1lZG91dCA9IGZhbHNlO1xuICB0aGlzLnRpbWVkb3V0RXJyb3IgPSBudWxsO1xuXG4gIHJldHVybiB0aGlzLl9lbmQoKTtcbn07XG5cbi8qKlxuICogUHJvbWlzZSBzdXBwb3J0XG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gcmVzb2x2ZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gW3JlamVjdF1cbiAqIEByZXR1cm4ge1JlcXVlc3R9XG4gKi9cblxuUmVxdWVzdEJhc2UucHJvdG90eXBlLnRoZW4gPSBmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG4gIGlmICghdGhpcy5fZnVsbGZpbGxlZFByb21pc2UpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBpZiAodGhpcy5fZW5kQ2FsbGVkKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICdXYXJuaW5nOiBzdXBlcmFnZW50IHJlcXVlc3Qgd2FzIHNlbnQgdHdpY2UsIGJlY2F1c2UgYm90aCAuZW5kKCkgYW5kIC50aGVuKCkgd2VyZSBjYWxsZWQuIE5ldmVyIGNhbGwgLmVuZCgpIGlmIHlvdSB1c2UgcHJvbWlzZXMnXG4gICAgICApO1xuICAgIH1cblxuICAgIHRoaXMuX2Z1bGxmaWxsZWRQcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgc2VsZi5vbignYWJvcnQnLCAoKSA9PiB7XG4gICAgICAgIC8vIFRpbWVvdXRzIGFib3J0IHRoZSBjdXJyZW50IGF0dGVtcHQgYmVmb3JlIHJldHJ5aW5nOyBhbiBleHBsaWNpdFxuICAgICAgICAvLyBhYm9ydCBtdXN0IHN0aWxsIHJlamVjdCBldmVuIHdoZW4gYXR0ZW1wdHMgcmVtYWluLlxuICAgICAgICBpZiAodGhpcy50aW1lZG91dCAmJiB0aGlzLl9tYXhSZXRyaWVzICYmIHRoaXMuX21heFJldHJpZXMgPiB0aGlzLl9yZXRyaWVzKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMudGltZWRvdXQgJiYgdGhpcy50aW1lZG91dEVycm9yKSB7XG4gICAgICAgICAgcmVqZWN0KHRoaXMudGltZWRvdXRFcnJvcik7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ0Fib3J0ZWQnKTtcbiAgICAgICAgZXJyb3IuY29kZSA9ICdBQk9SVEVEJztcbiAgICAgICAgZXJyb3Iuc3RhdHVzID0gdGhpcy5zdGF0dXM7XG4gICAgICAgIGVycm9yLm1ldGhvZCA9IHRoaXMubWV0aG9kO1xuICAgICAgICBlcnJvci51cmwgPSB0aGlzLnVybDtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH0pO1xuICAgICAgc2VsZi5lbmQoKGVycm9yLCByZXMpID0+IHtcbiAgICAgICAgaWYgKGVycm9yKSByZWplY3QoZXJyb3IpO1xuICAgICAgICBlbHNlIHJlc29sdmUocmVzKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHRoaXMuX2Z1bGxmaWxsZWRQcm9taXNlLnRoZW4ocmVzb2x2ZSwgcmVqZWN0KTtcbn07XG5cblJlcXVlc3RCYXNlLnByb3RvdHlwZS5jYXRjaCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICByZXR1cm4gdGhpcy50aGVuKHVuZGVmaW5lZCwgY2FsbGJhY2spO1xufTtcblxuLyoqXG4gKiBBbGxvdyBmb3IgZXh0ZW5zaW9uXG4gKi9cblxuUmVxdWVzdEJhc2UucHJvdG90eXBlLnVzZSA9IGZ1bmN0aW9uIChmbikge1xuICBmbih0aGlzKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5SZXF1ZXN0QmFzZS5wcm90b3R5cGUub2sgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgaWYgKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykgdGhyb3cgbmV3IEVycm9yKCdDYWxsYmFjayByZXF1aXJlZCcpO1xuICB0aGlzLl9va0NhbGxiYWNrID0gY2FsbGJhY2s7XG4gIHJldHVybiB0aGlzO1xufTtcblxuUmVxdWVzdEJhc2UucHJvdG90eXBlLl9pc1Jlc3BvbnNlT0sgPSBmdW5jdGlvbiAocmVzKSB7XG4gIGlmICghcmVzKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKHRoaXMuX29rQ2FsbGJhY2spIHtcbiAgICByZXR1cm4gdGhpcy5fb2tDYWxsYmFjayhyZXMpO1xuICB9XG5cbiAgcmV0dXJuIHJlcy5zdGF0dXMgPj0gMjAwICYmIHJlcy5zdGF0dXMgPCAzMDA7XG59O1xuXG4vKipcbiAqIEdldCByZXF1ZXN0IGhlYWRlciBgZmllbGRgLlxuICogQ2FzZS1pbnNlbnNpdGl2ZS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmllbGRcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuUmVxdWVzdEJhc2UucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChmaWVsZCkge1xuICByZXR1cm4gdGhpcy5faGVhZGVyW2ZpZWxkLnRvTG93ZXJDYXNlKCldO1xufTtcblxuLyoqXG4gKiBHZXQgY2FzZS1pbnNlbnNpdGl2ZSBoZWFkZXIgYGZpZWxkYCB2YWx1ZS5cbiAqIFRoaXMgaXMgYSBkZXByZWNhdGVkIGludGVybmFsIEFQSS4gVXNlIGAuZ2V0KGZpZWxkKWAgaW5zdGVhZC5cbiAqXG4gKiAoZ2V0SGVhZGVyIGlzIG5vIGxvbmdlciB1c2VkIGludGVybmFsbHkgYnkgdGhlIHN1cGVyYWdlbnQgY29kZSBiYXNlKVxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWVsZFxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKiBAZGVwcmVjYXRlZFxuICovXG5cblJlcXVlc3RCYXNlLnByb3RvdHlwZS5nZXRIZWFkZXIgPSBSZXF1ZXN0QmFzZS5wcm90b3R5cGUuZ2V0O1xuXG4vKipcbiAqIFNldCBoZWFkZXIgYGZpZWxkYCB0byBgdmFsYCwgb3IgbXVsdGlwbGUgZmllbGRzIHdpdGggb25lIG9iamVjdC5cbiAqIENhc2UtaW5zZW5zaXRpdmUuXG4gKlxuICogRXhhbXBsZXM6XG4gKlxuICogICAgICByZXEuZ2V0KCcvJylcbiAqICAgICAgICAuc2V0KCdBY2NlcHQnLCAnYXBwbGljYXRpb24vanNvbicpXG4gKiAgICAgICAgLnNldCgnWC1BUEktS2V5JywgJ2Zvb2JhcicpXG4gKiAgICAgICAgLmVuZChjYWxsYmFjayk7XG4gKlxuICogICAgICByZXEuZ2V0KCcvJylcbiAqICAgICAgICAuc2V0KHsgQWNjZXB0OiAnYXBwbGljYXRpb24vanNvbicsICdYLUFQSS1LZXknOiAnZm9vYmFyJyB9KVxuICogICAgICAgIC5lbmQoY2FsbGJhY2spO1xuICpcbiAqIEBwYXJhbSB7U3RyaW5nfE9iamVjdH0gZmllbGRcbiAqIEBwYXJhbSB7U3RyaW5nfSB2YWxcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0QmFzZS5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKGZpZWxkLCB2YWx1ZSkge1xuICBpZiAoaXNPYmplY3QoZmllbGQpKSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gZmllbGQpIHtcbiAgICAgIGlmIChoYXNPd24oZmllbGQsIGtleSkpIHRoaXMuc2V0KGtleSwgZmllbGRba2V5XSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICB0aGlzLl9oZWFkZXJbZmllbGQudG9Mb3dlckNhc2UoKV0gPSB2YWx1ZTtcbiAgdGhpcy5oZWFkZXJbZmllbGRdID0gdmFsdWU7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSZW1vdmUgaGVhZGVyIGBmaWVsZGAuXG4gKiBDYXNlLWluc2Vuc2l0aXZlLlxuICpcbiAqIEV4YW1wbGU6XG4gKlxuICogICAgICByZXEuZ2V0KCcvJylcbiAqICAgICAgICAudW5zZXQoJ1VzZXItQWdlbnQnKVxuICogICAgICAgIC5lbmQoY2FsbGJhY2spO1xuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWVsZCBmaWVsZCBuYW1lXG4gKi9cblJlcXVlc3RCYXNlLnByb3RvdHlwZS51bnNldCA9IGZ1bmN0aW9uIChmaWVsZCkge1xuICBkZWxldGUgdGhpcy5faGVhZGVyW2ZpZWxkLnRvTG93ZXJDYXNlKCldO1xuICBkZWxldGUgdGhpcy5oZWFkZXJbZmllbGRdO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogV3JpdGUgdGhlIGZpZWxkIGBuYW1lYCBhbmQgYHZhbGAsIG9yIG11bHRpcGxlIGZpZWxkcyB3aXRoIG9uZSBvYmplY3RcbiAqIGZvciBcIm11bHRpcGFydC9mb3JtLWRhdGFcIiByZXF1ZXN0IGJvZGllcy5cbiAqXG4gKiBgYGAganNcbiAqIHJlcXVlc3QucG9zdCgnL3VwbG9hZCcpXG4gKiAgIC5maWVsZCgnZm9vJywgJ2JhcicpXG4gKiAgIC5lbmQoY2FsbGJhY2spO1xuICpcbiAqIHJlcXVlc3QucG9zdCgnL3VwbG9hZCcpXG4gKiAgIC5maWVsZCh7IGZvbzogJ2JhcicsIGJhejogJ3F1eCcgfSlcbiAqICAgLmVuZChjYWxsYmFjayk7XG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xPYmplY3R9IG5hbWUgbmFtZSBvZiBmaWVsZFxuICogQHBhcmFtIHtTdHJpbmd8QmxvYnxGaWxlfEJ1ZmZlcnxmcy5SZWFkU3RyZWFtfSB2YWwgdmFsdWUgb2YgZmllbGRcbiAqIEBwYXJhbSB7U3RyaW5nfSBvcHRpb25zIGV4dHJhIG9wdGlvbnMsIGUuZy4gJ2Jsb2InXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblJlcXVlc3RCYXNlLnByb3RvdHlwZS5maWVsZCA9IGZ1bmN0aW9uIChuYW1lLCB2YWx1ZSwgb3B0aW9ucykge1xuICAvLyBuYW1lIHNob3VsZCBiZSBlaXRoZXIgYSBzdHJpbmcgb3IgYW4gb2JqZWN0LlxuICBpZiAobmFtZSA9PT0gbnVsbCB8fCB1bmRlZmluZWQgPT09IG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJy5maWVsZChuYW1lLCB2YWwpIG5hbWUgY2FuIG5vdCBiZSBlbXB0eScpO1xuICB9XG5cbiAgaWYgKHRoaXMuX2RhdGEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBcIi5maWVsZCgpIGNhbid0IGJlIHVzZWQgaWYgLnNlbmQoKSBpcyB1c2VkLiBQbGVhc2UgdXNlIG9ubHkgLnNlbmQoKSBvciBvbmx5IC5maWVsZCgpICYgLmF0dGFjaCgpXCJcbiAgICApO1xuICB9XG5cbiAgaWYgKGlzT2JqZWN0KG5hbWUpKSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gbmFtZSkge1xuICAgICAgaWYgKGhhc093bihuYW1lLCBrZXkpKSB0aGlzLmZpZWxkKGtleSwgbmFtZVtrZXldKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgIGZvciAoY29uc3QgaSBpbiB2YWx1ZSkge1xuICAgICAgaWYgKGhhc093bih2YWx1ZSwgaSkpIHRoaXMuZmllbGQobmFtZSwgdmFsdWVbaV0pO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLy8gdmFsIHNob3VsZCBiZSBkZWZpbmVkIG5vd1xuICBpZiAodmFsdWUgPT09IG51bGwgfHwgdW5kZWZpbmVkID09PSB2YWx1ZSkge1xuICAgIHRocm93IG5ldyBFcnJvcignLmZpZWxkKG5hbWUsIHZhbCkgdmFsIGNhbiBub3QgYmUgZW1wdHknKTtcbiAgfVxuXG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuICAgIHZhbHVlID0gU3RyaW5nKHZhbHVlKTtcbiAgfVxuXG4gIC8vIGZpeCBodHRwczovL2dpdGh1Yi5jb20vbGFkanMvc3VwZXJhZ2VudC9pc3N1ZXMvMTY4MFxuICBpZiAob3B0aW9ucykgdGhpcy5fZ2V0Rm9ybURhdGEoKS5hcHBlbmQobmFtZSwgdmFsdWUsIG9wdGlvbnMpO1xuICBlbHNlIHRoaXMuX2dldEZvcm1EYXRhKCkuYXBwZW5kKG5hbWUsIHZhbHVlKTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogQWJvcnQgdGhlIHJlcXVlc3QsIGFuZCBjbGVhciBwb3RlbnRpYWwgdGltZW91dC5cbiAqXG4gKiBAcmV0dXJuIHtSZXF1ZXN0fSByZXF1ZXN0XG4gKiBAYXBpIHB1YmxpY1xuICovXG5SZXF1ZXN0QmFzZS5wcm90b3R5cGUuYWJvcnQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLl9hYm9ydGVkKSB7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICB0aGlzLl9hYm9ydGVkID0gdHJ1ZTtcbiAgaWYgKHRoaXMueGhyKSB0aGlzLnhoci5hYm9ydCgpOyAvLyBicm93c2VyXG4gIGlmICh0aGlzLnJlcSkge1xuICAgIHRoaXMucmVxLmFib3J0KCk7IC8vIG5vZGVcbiAgfVxuXG4gIHRoaXMuY2xlYXJUaW1lb3V0KCk7XG4gIHRoaXMuZW1pdCgnYWJvcnQnKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5SZXF1ZXN0QmFzZS5wcm90b3R5cGUuX2F1dGggPSBmdW5jdGlvbiAodXNlciwgcGFzcywgb3B0aW9ucywgYmFzZTY0RW5jb2Rlcikge1xuICBzd2l0Y2ggKG9wdGlvbnMudHlwZSkge1xuICAgIGNhc2UgJ2Jhc2ljJzpcbiAgICAgIHRoaXMuc2V0KCdBdXRob3JpemF0aW9uJywgYEJhc2ljICR7YmFzZTY0RW5jb2RlcihgJHt1c2VyfToke3Bhc3N9YCl9YCk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJ2F1dG8nOlxuICAgICAgdGhpcy51c2VybmFtZSA9IHVzZXI7XG4gICAgICB0aGlzLnBhc3N3b3JkID0gcGFzcztcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSAnYmVhcmVyJzogLy8gdXNhZ2Ugd291bGQgYmUgLmF1dGgoYWNjZXNzVG9rZW4sIHsgdHlwZTogJ2JlYXJlcicgfSlcbiAgICAgIHRoaXMuc2V0KCdBdXRob3JpemF0aW9uJywgYEJlYXJlciAke3VzZXJ9YCk7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgYnJlYWs7XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogRW5hYmxlIHRyYW5zbWlzc2lvbiBvZiBjb29raWVzIHdpdGggeC1kb21haW4gcmVxdWVzdHMuXG4gKlxuICogTm90ZSB0aGF0IGZvciB0aGlzIHRvIHdvcmsgdGhlIG9yaWdpbiBtdXN0IG5vdCBiZVxuICogdXNpbmcgXCJBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW5cIiB3aXRoIGEgd2lsZGNhcmQsXG4gKiBhbmQgYWxzbyBtdXN0IHNldCBcIkFjY2Vzcy1Db250cm9sLUFsbG93LUNyZWRlbnRpYWxzXCJcbiAqIHRvIFwidHJ1ZVwiLlxuICogQHBhcmFtIHtCb29sZWFufSBbb249dHJ1ZV0gLSBTZXQgJ3dpdGhDcmVkZW50aWFscycgc3RhdGVcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0QmFzZS5wcm90b3R5cGUud2l0aENyZWRlbnRpYWxzID0gZnVuY3Rpb24gKG9uKSB7XG4gIC8vIFRoaXMgaXMgYnJvd3Nlci1vbmx5IGZ1bmN0aW9uYWxpdHkuIE5vZGUgc2lkZSBpcyBuby1vcC5cbiAgaWYgKG9uID09PSB1bmRlZmluZWQpIG9uID0gdHJ1ZTtcbiAgdGhpcy5fd2l0aENyZWRlbnRpYWxzID0gb247XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgdGhlIG1heCByZWRpcmVjdHMgdG8gYG5gLiBEb2VzIG5vdGhpbmcgaW4gYnJvd3NlciBYSFIgaW1wbGVtZW50YXRpb24uXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG5cbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5SZXF1ZXN0QmFzZS5wcm90b3R5cGUucmVkaXJlY3RzID0gZnVuY3Rpb24gKG4pIHtcbiAgdGhpcy5fbWF4UmVkaXJlY3RzID0gbjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIE1heGltdW0gc2l6ZSBvZiBidWZmZXJlZCByZXNwb25zZSBib2R5LCBpbiBieXRlcy4gQ291bnRzIHVuY29tcHJlc3NlZCBzaXplLlxuICogRGVmYXVsdCAyMDBNQi5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbiBudW1iZXIgb2YgYnl0ZXNcbiAqIEByZXR1cm4ge1JlcXVlc3R9IGZvciBjaGFpbmluZ1xuICovXG5SZXF1ZXN0QmFzZS5wcm90b3R5cGUubWF4UmVzcG9uc2VTaXplID0gZnVuY3Rpb24gKG4pIHtcbiAgaWYgKHR5cGVvZiBuICE9PSAnbnVtYmVyJykge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0ludmFsaWQgYXJndW1lbnQnKTtcbiAgfVxuXG4gIHRoaXMuX21heFJlc3BvbnNlU2l6ZSA9IG47XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBDb252ZXJ0IHRvIGEgcGxhaW4gamF2YXNjcmlwdCBvYmplY3QgKG5vdCBKU09OIHN0cmluZykgb2Ygc2NhbGFyIHByb3BlcnRpZXMuXG4gKiBOb3RlIGFzIHRoaXMgbWV0aG9kIGlzIGRlc2lnbmVkIHRvIHJldHVybiBhIHVzZWZ1bCBub24tdGhpcyB2YWx1ZSxcbiAqIGl0IGNhbm5vdCBiZSBjaGFpbmVkLlxuICpcbiAqIEByZXR1cm4ge09iamVjdH0gZGVzY3JpYmluZyBtZXRob2QsIHVybCwgYW5kIGRhdGEgb2YgdGhpcyByZXF1ZXN0XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3RCYXNlLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB7XG4gICAgbWV0aG9kOiB0aGlzLm1ldGhvZCxcbiAgICB1cmw6IHRoaXMudXJsLFxuICAgIGRhdGE6IHRoaXMuX2RhdGEsXG4gICAgaGVhZGVyczogdGhpcy5faGVhZGVyXG4gIH07XG59O1xuXG4vKipcbiAqIFNlbmQgYGRhdGFgIGFzIHRoZSByZXF1ZXN0IGJvZHksIGRlZmF1bHRpbmcgdGhlIGAudHlwZSgpYCB0byBcImpzb25cIiB3aGVuXG4gKiBhbiBvYmplY3QgaXMgZ2l2ZW4uXG4gKlxuICogRXhhbXBsZXM6XG4gKlxuICogICAgICAgLy8gbWFudWFsIGpzb25cbiAqICAgICAgIHJlcXVlc3QucG9zdCgnL3VzZXInKVxuICogICAgICAgICAudHlwZSgnanNvbicpXG4gKiAgICAgICAgIC5zZW5kKCd7XCJuYW1lXCI6XCJ0alwifScpXG4gKiAgICAgICAgIC5lbmQoY2FsbGJhY2spXG4gKlxuICogICAgICAgLy8gYXV0byBqc29uXG4gKiAgICAgICByZXF1ZXN0LnBvc3QoJy91c2VyJylcbiAqICAgICAgICAgLnNlbmQoeyBuYW1lOiAndGonIH0pXG4gKiAgICAgICAgIC5lbmQoY2FsbGJhY2spXG4gKlxuICogICAgICAgLy8gbWFudWFsIHgtd3d3LWZvcm0tdXJsZW5jb2RlZFxuICogICAgICAgcmVxdWVzdC5wb3N0KCcvdXNlcicpXG4gKiAgICAgICAgIC50eXBlKCdmb3JtJylcbiAqICAgICAgICAgLnNlbmQoJ25hbWU9dGonKVxuICogICAgICAgICAuZW5kKGNhbGxiYWNrKVxuICpcbiAqICAgICAgIC8vIGF1dG8geC13d3ctZm9ybS11cmxlbmNvZGVkXG4gKiAgICAgICByZXF1ZXN0LnBvc3QoJy91c2VyJylcbiAqICAgICAgICAgLnR5cGUoJ2Zvcm0nKVxuICogICAgICAgICAuc2VuZCh7IG5hbWU6ICd0aicgfSlcbiAqICAgICAgICAgLmVuZChjYWxsYmFjaylcbiAqXG4gKiAgICAgICAvLyBkZWZhdWx0cyB0byB4LXd3dy1mb3JtLXVybGVuY29kZWRcbiAqICAgICAgcmVxdWVzdC5wb3N0KCcvdXNlcicpXG4gKiAgICAgICAgLnNlbmQoJ25hbWU9dG9iaScpXG4gKiAgICAgICAgLnNlbmQoJ3NwZWNpZXM9ZmVycmV0JylcbiAqICAgICAgICAuZW5kKGNhbGxiYWNrKVxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfE9iamVjdH0gZGF0YVxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBjb21wbGV4aXR5XG5SZXF1ZXN0QmFzZS5wcm90b3R5cGUuc2VuZCA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gIGNvbnN0IGlzT2JqZWN0XyA9IGlzT2JqZWN0KGRhdGEpO1xuICBsZXQgdHlwZSA9IHRoaXMuX2hlYWRlclsnY29udGVudC10eXBlJ107XG5cbiAgaWYgKHRoaXMuX2Zvcm1EYXRhKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgXCIuc2VuZCgpIGNhbid0IGJlIHVzZWQgaWYgLmF0dGFjaCgpIG9yIC5maWVsZCgpIGlzIHVzZWQuIFBsZWFzZSB1c2Ugb25seSAuc2VuZCgpIG9yIG9ubHkgLmZpZWxkKCkgJiAuYXR0YWNoKClcIlxuICAgICk7XG4gIH1cblxuICBpZiAoaXNPYmplY3RfICYmICF0aGlzLl9kYXRhKSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgIHRoaXMuX2RhdGEgPSBbXTtcbiAgICB9IGVsc2UgaWYgKCF0aGlzLl9pc0hvc3QoZGF0YSkpIHtcbiAgICAgIHRoaXMuX2RhdGEgPSB7fTtcbiAgICB9XG4gIH0gZWxzZSBpZiAoZGF0YSAmJiB0aGlzLl9kYXRhICYmIHRoaXMuX2lzSG9zdCh0aGlzLl9kYXRhKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IG1lcmdlIHRoZXNlIHNlbmQgY2FsbHNcIik7XG4gIH1cblxuICAvLyBtZXJnZVxuICBpZiAoaXNPYmplY3RfICYmIGlzT2JqZWN0KHRoaXMuX2RhdGEpKSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gZGF0YSkge1xuICAgICAgaWYgKHR5cGVvZiBkYXRhW2tleV0gPT0gJ2JpZ2ludCcgJiYgIWRhdGFba2V5XS50b0pTT04pXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IHNlcmlhbGl6ZSBCaWdJbnQgdmFsdWUgdG8ganNvbicpO1xuICAgICAgaWYgKCFoYXNPd24oZGF0YSwga2V5KSkgY29udGludWU7XG4gICAgICBpZiAoaXNTYWZlS2V5KGtleSkpIHtcbiAgICAgICAgdGhpcy5fZGF0YVtrZXldID0gZGF0YVtrZXldO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gYW4gb3duIFwiX19wcm90b19fXCIga2V5IChlLmcuIGZyb20gSlNPTi5wYXJzZSBvZiB1bnRydXN0ZWQgaW5wdXQpXG4gICAgICAgIC8vIG11c3QgYmVjb21lIGEgcGxhaW4gb3duIHByb3BlcnR5IG9mIHRoZSBwYXlsb2FkIHJhdGhlciB0aGFuXG4gICAgICAgIC8vIHJlcGxhY2luZyB0aGUgcGF5bG9hZCdzIHByb3RvdHlwZSBhbmQgdmFuaXNoaW5nIGZyb20gdGhlIGJvZHlcbiAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMuX2RhdGEsIGtleSwge1xuICAgICAgICAgIHZhbHVlOiBkYXRhW2tleV0sXG4gICAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGVsc2UgaWYgKHR5cGVvZiBkYXRhID09PSAnYmlnaW50JykgdGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IHNlbmQgdmFsdWUgb2YgdHlwZSBCaWdJbnRcIik7XG4gIGVsc2UgaWYgKHR5cGVvZiBkYXRhID09PSAnc3RyaW5nJykge1xuICAgIC8vIGRlZmF1bHQgdG8geC13d3ctZm9ybS11cmxlbmNvZGVkXG4gICAgaWYgKCF0eXBlKSB0aGlzLnR5cGUoJ2Zvcm0nKTtcbiAgICB0eXBlID0gdGhpcy5faGVhZGVyWydjb250ZW50LXR5cGUnXTtcbiAgICBpZiAodHlwZSkgdHlwZSA9IHR5cGUudG9Mb3dlckNhc2UoKS50cmltKCk7XG4gICAgaWYgKHR5cGUgPT09ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnKSB7XG4gICAgICB0aGlzLl9kYXRhID0gdGhpcy5fZGF0YSA/IGAke3RoaXMuX2RhdGF9JiR7ZGF0YX1gIDogZGF0YTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fZGF0YSA9ICh0aGlzLl9kYXRhIHx8ICcnKSArIGRhdGE7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRoaXMuX2RhdGEgPSBkYXRhO1xuICB9XG5cbiAgaWYgKCFpc09iamVjdF8gfHwgdGhpcy5faXNIb3N0KGRhdGEpKSB7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyBkZWZhdWx0IHRvIGpzb25cbiAgaWYgKCF0eXBlKSB0aGlzLnR5cGUoJ2pzb24nKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFNvcnQgYHF1ZXJ5c3RyaW5nYCBieSB0aGUgc29ydCBmdW5jdGlvblxuICpcbiAqXG4gKiBFeGFtcGxlczpcbiAqXG4gKiAgICAgICAvLyBkZWZhdWx0IG9yZGVyXG4gKiAgICAgICByZXF1ZXN0LmdldCgnL3VzZXInKVxuICogICAgICAgICAucXVlcnkoJ25hbWU9TmljaycpXG4gKiAgICAgICAgIC5xdWVyeSgnc2VhcmNoPU1hbm55JylcbiAqICAgICAgICAgLnNvcnRRdWVyeSgpXG4gKiAgICAgICAgIC5lbmQoY2FsbGJhY2spXG4gKlxuICogICAgICAgLy8gY3VzdG9taXplZCBzb3J0IGZ1bmN0aW9uXG4gKiAgICAgICByZXF1ZXN0LmdldCgnL3VzZXInKVxuICogICAgICAgICAucXVlcnkoJ25hbWU9TmljaycpXG4gKiAgICAgICAgIC5xdWVyeSgnc2VhcmNoPU1hbm55JylcbiAqICAgICAgICAgLnNvcnRRdWVyeShmdW5jdGlvbihhLCBiKXtcbiAqICAgICAgICAgICByZXR1cm4gYS5sZW5ndGggLSBiLmxlbmd0aDtcbiAqICAgICAgICAgfSlcbiAqICAgICAgICAgLmVuZChjYWxsYmFjaylcbiAqXG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gc29ydFxuICogQHJldHVybiB7UmVxdWVzdH0gZm9yIGNoYWluaW5nXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cblJlcXVlc3RCYXNlLnByb3RvdHlwZS5zb3J0UXVlcnkgPSBmdW5jdGlvbiAoc29ydCkge1xuICAvLyBfc29ydCBkZWZhdWx0IHRvIHRydWUgYnV0IG90aGVyd2lzZSBjYW4gYmUgYSBmdW5jdGlvbiBvciBib29sZWFuXG4gIHRoaXMuX3NvcnQgPSB0eXBlb2Ygc29ydCA9PT0gJ3VuZGVmaW5lZCcgPyB0cnVlIDogc29ydDtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIENvbXBvc2UgcXVlcnlzdHJpbmcgdG8gYXBwZW5kIHRvIHJlcS51cmxcbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuUmVxdWVzdEJhc2UucHJvdG90eXBlLl9maW5hbGl6ZVF1ZXJ5U3RyaW5nID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBxdWVyeSA9IHRoaXMuX3F1ZXJ5LmpvaW4oJyYnKTtcbiAgaWYgKHF1ZXJ5KSB7XG4gICAgdGhpcy51cmwgKz0gKHRoaXMudXJsLmluY2x1ZGVzKCc/JykgPyAnJicgOiAnPycpICsgcXVlcnk7XG4gIH1cblxuICB0aGlzLl9xdWVyeS5sZW5ndGggPSAwOyAvLyBNYWtlcyB0aGUgY2FsbCBpZGVtcG90ZW50XG5cbiAgaWYgKHRoaXMuX3NvcnQpIHtcbiAgICBjb25zdCBpbmRleCA9IHRoaXMudXJsLmluZGV4T2YoJz8nKTtcbiAgICBpZiAoaW5kZXggPj0gMCkge1xuICAgICAgY29uc3QgcXVlcnlBcnJheSA9IHRoaXMudXJsLnNsaWNlKGluZGV4ICsgMSkuc3BsaXQoJyYnKTtcbiAgICAgIGlmICh0eXBlb2YgdGhpcy5fc29ydCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBxdWVyeUFycmF5LnNvcnQodGhpcy5fc29ydCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBxdWVyeUFycmF5LnNvcnQoKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy51cmwgPSB0aGlzLnVybC5zbGljZSgwLCBpbmRleCkgKyAnPycgKyBxdWVyeUFycmF5LmpvaW4oJyYnKTtcbiAgICB9XG4gIH1cbn07XG5cbi8vIEZvciBiYWNrd2FyZHMgY29tcGF0IG9ubHlcblJlcXVlc3RCYXNlLnByb3RvdHlwZS5fYXBwZW5kUXVlcnlTdHJpbmcgPSAoKSA9PiB7XG4gIGNvbnNvbGUud2FybignVW5zdXBwb3J0ZWQnKTtcbn07XG5cbi8qKlxuICogSW52b2tlIGNhbGxiYWNrIHdpdGggdGltZW91dCBlcnJvci5cbiAqXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5SZXF1ZXN0QmFzZS5wcm90b3R5cGUuX3RpbWVvdXRFcnJvciA9IGZ1bmN0aW9uIChyZWFzb24sIHRpbWVvdXQsIGVycm5vKSB7XG4gIGlmICh0aGlzLl9hYm9ydGVkKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoYCR7cmVhc29uICsgdGltZW91dH1tcyBleGNlZWRlZGApO1xuICBlcnJvci50aW1lb3V0ID0gdGltZW91dDtcbiAgZXJyb3IuY29kZSA9ICdFQ09OTkFCT1JURUQnO1xuICBlcnJvci5lcnJubyA9IGVycm5vO1xuICB0aGlzLnRpbWVkb3V0ID0gdHJ1ZTtcbiAgdGhpcy50aW1lZG91dEVycm9yID0gZXJyb3I7XG4gIHRoaXMuYWJvcnQoKTtcbiAgdGhpcy5jYWxsYmFjayhlcnJvcik7XG59O1xuXG5SZXF1ZXN0QmFzZS5wcm90b3R5cGUuX3NldFRpbWVvdXRzID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBzZWxmID0gdGhpcztcblxuICAvLyBkZWFkbGluZVxuICBpZiAodGhpcy5fdGltZW91dCAmJiAhdGhpcy5fdGltZXIpIHtcbiAgICB0aGlzLl90aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgc2VsZi5fdGltZW91dEVycm9yKCdUaW1lb3V0IG9mICcsIHNlbGYuX3RpbWVvdXQsICdFVElNRScpO1xuICAgIH0sIHRoaXMuX3RpbWVvdXQpO1xuICB9XG5cbiAgLy8gcmVzcG9uc2UgdGltZW91dFxuICBpZiAodGhpcy5fcmVzcG9uc2VUaW1lb3V0ICYmICF0aGlzLl9yZXNwb25zZVRpbWVvdXRUaW1lcikge1xuICAgIHRoaXMuX3Jlc3BvbnNlVGltZW91dFRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBzZWxmLl90aW1lb3V0RXJyb3IoXG4gICAgICAgICdSZXNwb25zZSB0aW1lb3V0IG9mICcsXG4gICAgICAgIHNlbGYuX3Jlc3BvbnNlVGltZW91dCxcbiAgICAgICAgJ0VUSU1FRE9VVCdcbiAgICAgICk7XG4gICAgfSwgdGhpcy5fcmVzcG9uc2VUaW1lb3V0KTtcbiAgfVxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBO0FBQ0E7QUFDQSxNQUFNO0VBQUVBLFFBQVE7RUFBRUMsTUFBTTtFQUFFQztBQUFVLENBQUMsR0FBR0MsT0FBTyxDQUFDLFNBQVMsQ0FBQzs7QUFFMUQ7QUFDQTtBQUNBOztBQUVBQyxNQUFNLENBQUNDLE9BQU8sR0FBR0MsV0FBVzs7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