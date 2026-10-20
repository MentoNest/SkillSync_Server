declare class ModuleResolveError extends Error {
  readonly code: string

  /**
   * @param msg - The error message.
   * @returns A new `ModuleResolveError` with code `INVALID_MODULE_SPECIFIER`.
   */
  static INVALID_MODULE_SPECIFIER(msg: string): ModuleResolveError
  /**
   * @param msg - The error message.
   * @returns A new `ModuleResolveError` with code `INVALID_PACKAGE_TARGET`.
   */
  static INVALID_PACKAGE_TARGET(msg: string): ModuleResolveError
  /**
   * @param msg - The error message.
   * @returns A new `ModuleResolveError` with code `PACKAGE_PATH_NOT_EXPORTED`.
   */
  static PACKAGE_PATH_NOT_EXPORTED(msg: string): ModuleResolveError
  /**
   * @param msg - The error message.
   * @returns A new `ModuleResolveError` with code `PACKAGE_IMPORT_NOT_DEFINED`.
   */
  static PACKAGE_IMPORT_NOT_DEFINED(msg: string): ModuleResolveError
  /**
   * @param msg - The error message.
   * @returns A new `ModuleResolveError` with code `UNSUPPORTED_ENGINE`.
   */
  static UNSUPPORTED_ENGINE(msg: string): ModuleResolveError
}

export = ModuleResolveError
