import URL from 'bare-url'

type ConditionalSpecifier =
  string | ConditionalSpecifier[] | { [condition: string]: ConditionalSpecifier }

type ImportsMap = { [specifier: string]: ConditionalSpecifier }

type ExportsMap = ImportsMap

type ResolutionsMap = { [href: string]: ImportsMap }

type Builtins = ConditionalSpecifier[]

type Conditions = string[] | Conditions[]

type Engines = { [name: string]: string }

type JSON = string | number | boolean | JSON[] | { [key: string]: JSON }

interface ResolveOptions {
  builtinProtocol?: string
  builtins?: Builtins
  conditions?: Conditions
  defer?: string[]
  deferredProtocol?: string
  directories?: boolean
  engines?: Engines
  extensions?: string[]
  imports?: ImportsMap
  matchedConditions?: string[]
  resolutions?: ResolutionsMap
}

/**
 * Resolve `specifier` relative to `parentURL`, which must be a WHATWG `URL` instance. `readPackage`
 * is called with a `URL` instance for every package manifest to be read and must either return the
 * parsed JSON package manifest, if it exists, or `null`. If `readPackage` returns a promise,
 * synchronous iteration is not supported.
 * @param specifier - The module specifier to resolve, relative to `parentURL`.
 * @param parentURL - The WHATWG `URL` that `specifier` is resolved against.
 * @param readPackage - Called with the `URL` of each package manifest to read; must return the
 * parsed JSON manifest if it exists, or `null`. Returning a promise disables synchronous iteration.
 * @returns Yields each candidate resolution `URL` in the order the algorithm tries them, for the
 * caller to test (for example check it exists); if none resolve, iteration simply ends without
 * yielding further values — it does not throw or return `null` for an unresolved specifier.
 * @throws {INVALID_MODULE_SPECIFIER} the specifier (or a `node:`-protocol target) is not a valid
 * module or package specifier: empty, a scoped package name missing the `/`, invalid characters, a
 * relative-style `node:` specifier, an unmatched internal `#import` specifier, or a `file:` path
 * containing an encoded `/` or `\`.
 * @throws {INVALID_PACKAGE_TARGET} a string target in a package's `"exports"` (or non-internal
 * `"imports"`) map does not start with `./`.
 * @throws {PACKAGE_PATH_NOT_EXPORTED} the requested subpath is not defined by the package's
 * `"exports"` map.
 * @throws {PACKAGE_IMPORT_NOT_DEFINED} an internal `#specifier` is not defined by the package's
 * `"imports"` map.
 * @throws {UNSUPPORTED_ENGINE} the package's `"engines"` requirement is not satisfied by the
 * corresponding `opts.engines` entry.
 */
declare function resolve(
  specifier: string,
  parentURL: URL,
  readPackage?: (url: URL) => JSON | null
): Iterable<URL>

declare function resolve(
  specifier: string,
  parentURL: URL,
  readPackage: (url: URL) => Promise<JSON | null>
): AsyncIterable<URL>

declare function resolve(
  specifier: string,
  parentURL: URL,
  opts: ResolveOptions,
  readPackage?: (url: URL) => JSON | null
): Iterable<URL>

declare function resolve(
  specifier: string,
  parentURL: URL,
  opts: ResolveOptions,
  readPackage: (url: URL) => Promise<JSON | null>
): AsyncIterable<URL>

declare namespace resolve {
  export {
    type ConditionalSpecifier,
    type ImportsMap,
    type ExportsMap,
    type ResolutionsMap,
    type Builtins,
    type Conditions,
    type Engines,
    type ResolveOptions
  }

  export const constants: {
    UNRESOLVED: number
    YIELDED: number
    RESOLVED: number
  }

  export type Resolver = Generator<
    { package: URL } | { resolution: URL },
    number,
    void | boolean | JSON | null
  >

  export function module(specifier: string, parentURL: URL, opts?: ResolveOptions): Resolver

  export function url(url: string, parentURL: URL, opts?: ResolveOptions): Resolver

  export function preresolved(
    specifier: string,
    resolutions: ResolutionsMap,
    parentURL: URL,
    opts?: ResolveOptions
  ): Resolver

  export function package(packageSpecifier: string, parentURL: URL, opts?: ResolveOptions): Resolver

  export function packageSelf(
    packageName: string,
    packageSubpath: string,
    parentURL: URL,
    opts?: ResolveOptions
  ): Resolver

  export function packageExports(
    packageURL: URL,
    subpath: string,
    packageExports: ExportsMap,
    opts?: ResolveOptions
  ): Resolver

  export function packageImports(specifier: string, parentURL: URL, opts?: ResolveOptions): Resolver

  export function packageImportsExports(
    matchKey: string,
    matchObject: ImportsMap | ExportsMap,
    packageURL: URL,
    isImports: boolean,
    opts?: ResolveOptions
  ): Resolver

  export function packageTarget(
    packageURL: URL,
    target: ConditionalSpecifier,
    patternMatch: string,
    isImports: boolean,
    opts?: ResolveOptions
  ): Resolver

  export function builtinTarget(
    packageSpecifier: string,
    packageVersion: string,
    target: ConditionalSpecifier,
    opts?: ResolveOptions
  ): Resolver

  export function file(
    filename: string,
    parentURL: URL,
    isIndex: boolean,
    opts?: ResolveOptions
  ): Resolver

  export function directory(dirname: string, parentURL: URL, opts?: ResolveOptions): Resolver
}

export = resolve
