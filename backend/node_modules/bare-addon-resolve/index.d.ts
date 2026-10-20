import URL from 'bare-url'
import { constants, type Builtins, type Conditions, type ResolutionsMap } from 'bare-module-resolve'

type JSON = string | number | boolean | JSON[] | { [key: string]: JSON }

interface ResolveOptions {
  builtinProtocol?: string
  builtins?: Builtins
  conditions?: Conditions
  extensions?: string[]
  host?: string
  hosts?: string[]
  linked?: boolean
  linkedProtocol?: string
  matchedConditions?: string[]
  resolutions?: ResolutionsMap
}

/**
 * Resolve `specifier` relative to `parentURL`, which must be a WHATWG `URL` instance. `readPackage`
 * is called with a `URL` instance for every package manifest to be read and must either return the
 * parsed JSON package manifest, if it exists, or `null`. If `readPackage` returns a promise,
 * synchronous iteration is not supported.
 * @param specifier - The module specifier to resolve.
 * @param parentURL - The URL to resolve `specifier` relative to.
 * @param readPackage - Called with the URL of each package manifest encountered; must return the
 * parsed manifest or `null`. Returning a promise disables synchronous iteration.
 * @returns Yields candidate resolution `URL`s for the caller to test, in the order the algorithm
 * tries them.
 * @throws {INVALID_ADDON_SPECIFIER} `parentURL` is a `file:` URL and the specifier contains a
 * percent-encoded `/` or `\` (`%2f` or `%5c`, in either case).
 * @throws {INVALID_PACKAGE_NAME} a package manifest's `name` field contains `__`.
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
  export { constants, type ResolveOptions }

  export type Resolver = Generator<
    { resolution: URL } | { package: URL },
    number,
    void | boolean | JSON | null
  >

  export function addon(specifier: string, parentURL: URL, opts?: ResolveOptions): Resolver

  export function url(specifier: string, parentURL: URL, opts?: ResolveOptions): Resolver

  export function package(
    packageSpecifier: string,
    packageVersion: string,
    parentURL: URL,
    opts?: ResolveOptions
  ): Resolver

  export function packageSelf(
    packageName: string,
    packageSubpath: string,
    packageVersion: string,
    parentURL: URL,
    opts?: ResolveOptions
  ): Resolver

  export function file(filename: string, parentURL: URL, opts?: ResolveOptions): Resolver

  export function directory(
    dirname: string,
    version: string,
    parentURL: URL,
    opts?: ResolveOptions
  ): Resolver

  export function linked(name: string, version?: string, opts?: ResolveOptions): Resolver
}

export = resolve
