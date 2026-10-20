module.exports = class AddonResolveError extends Error {
  constructor(msg, fn = AddonResolveError, code = fn.name) {
    super(`${code}: ${msg}`)

    this.code = code

    if (Error.captureStackTrace) Error.captureStackTrace(this, fn)
  }

  get name() {
    return 'AddonResolveError'
  }

  static INVALID_ADDON_SPECIFIER(msg) {
    return new AddonResolveError(msg, AddonResolveError.INVALID_ADDON_SPECIFIER)
  }

  static INVALID_PACKAGE_NAME(msg) {
    return new AddonResolveError(msg, AddonResolveError.INVALID_PACKAGE_NAME)
  }
}
