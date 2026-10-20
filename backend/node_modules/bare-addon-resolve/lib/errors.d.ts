declare class AddonResolveError extends Error {
  readonly code: string

  /**
   * @param msg - The error message.
   * @returns A new `AddonResolveError` with code `INVALID_ADDON_SPECIFIER`.
   */
  static INVALID_ADDON_SPECIFIER(msg: string): AddonResolveError
  /**
   * @param msg - The error message.
   * @returns A new `AddonResolveError` with code `INVALID_PACKAGE_NAME`.
   */
  static INVALID_PACKAGE_NAME(msg: string): AddonResolveError
}

export = AddonResolveError
