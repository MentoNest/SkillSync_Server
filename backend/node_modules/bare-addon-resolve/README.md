# bare-addon-resolve

Low-level addon resolution algorithm for Bare. The algorithm is implemented as a generator function that yields either package manifests to be read or resolution candidates to be tested by the caller. As a convenience, the main export is a synchronous and asynchronous iterable that relies on package manifests being read by a callback. For asynchronous iteration, the callback may return promises which will be awaited before being passed to the generator.

```
npm i bare-addon-resolve
```

## Usage

For synchronous resolution:

```js
const resolve = require('bare-addon-resolve')

function readPackage(url) {
  // Read and parse `url` if it exists, otherwise `null`
}

for (const resolution of resolve('./addon', new URL('file:///directory/'), readPackage)) {
  console.log(resolution)
}
```

For asynchronous resolution:

```js
const resolve = require('bare-addon-resolve')

async function readPackage(url) {
  // Read and parse `url` if it exists, otherwise `null`
}

for await (const resolution of resolve('./addon', new URL('file:///directory/'), readPackage)) {
  console.log(resolution)
}
```

## API

See the [`bare-addon-resolve` reference](https://docs.pears.com/reference/bare/modules/bare-addon-resolve).

## Algorithm

The following generator functions implement the resolution algorithm. The yielded values have the following shape:

**Package manifest**

```js
next.value = {
  package: URL
}
```

If the package manifest identified by `next.value.package` exists, `generator.next()` must be passed the parsed JSON value of the manifest. If it does not exist, pass `null` instead.

**Resolution candidate**

```js
next.value = {
  resolution: URL
}
```

If the addon identified by `next.value.resolution` exists, `generator.next()` may be passed `true` to signal that the resolution for the current set of conditions has been identified. If it does not exist, pass `false` instead.

To drive the generator functions, a loop like the following can be used:

```js
const generator = resolve.addon(specifier, parentURL)

let next = generator.next()

while (next.done !== true) {
  const value = next.value

  if (value.package) {
    // Read and parse `value.package` if it exists, otherwise `null`
    let info

    next = generator.next(info)
  } else {
    const resolution = value.resolution

    // `true` if `resolution` was the correct candidate, otherwise `false`
    let resolved

    next = generator.next(resolved)
  }
}
```

Options are the same as `resolve()` for all functions.

> [!WARNING]
> These functions are currently subject to change between minor releases. If using them directly, make sure to specify a tilde range (`~1.2.3`) when declaring the module dependency.

The `preresolved`, `builtinTarget`, and `lookupPackageScope` generators referenced below are provided by [`bare-module-resolve`](https://github.com/holepunchto/bare-module-resolve) and behave as documented there.

### `const generator = resolve.addon(specifier, parentURL[, options])`

1.  If `specifier` [starts with a Windows drive letter](https://url.spec.whatwg.org/#start-with-a-windows-drive-letter):
    1.  Prepend `/` to `specifier`.
2.  If `options.resolutions` is set:
    1.  If `preresolved(specifier, options.resolutions, parentURL, options)` yields a resolution that isn't deferred, return.
3.  If `url(specifier, parentURL, options)` yields, return.
4.  Let `version` be `null`.
5.  Let `i` be the index of the last `@` in `specifier`.
6.  If `i` is greater than `0`:
    1.  Set `version` to the substring of `specifier` following `i`.
    2.  If `version` is a valid semantic version:
        1.  Set `specifier` to the substring of `specifier` until `i`.
    3.  Otherwise, set `version` to `null`.
7.  If `specifier` equals `.` or `..`, or if `specifier` starts with `/`, `\`, `./`, `.\`, `../`, or `..\`:
    1.  If `file(specifier, parentURL, options)` resolves, return.
    2.  Return `directory(specifier, version, parentURL, options)`.
8.  Return `package(specifier, version, parentURL, options)`.

### `const generator = resolve.url(url, parentURL[, options])`

1.  If `url` is not a valid URL, return.
2.  Yield `url`.

### `const generator = resolve.package(packageSpecifier, packageVersion, parentURL[, options])`

1.  If `packageSpecifier` is the empty string, throw.
2.  If `packageSpecifier` does not start with `@`:
    1.  Set `packageName` to the substring of `packageSpecifier` until the first `/` or the end of the string.
3.  Otherwise:
    1.  If `packageSpecifier` does not include `/`, throw.
    2.  Set `packageName` to the substring of `packageSpecifier` until the second `/` or the end of the string.
4.  If `packageName` starts with `.` or includes `\` or `%`, throw.
5.  Let `packageSubpath` be `.` concatenated with the substring of `packageSpecifier` from the position at the length of `packageName`.
6.  If `parentURL` has an opaque path, return.
7.  If `packageSelf(packageName, packageSubpath, packageVersion, parentURL, options)` yields, return.
8.  Repeat:
    1.  Let `packageURL` be the resolution of `node_modules/` concatenated with `packageName` and `/` relative to `parentURL`.
    2.  Set `parentURL` to its parent directory.
    3.  Let `info` be the result of yielding the resolution of `package.json` relative to `packageURL`.
    4.  If `info` is not `null`:
        1.  Return `directory(packageSubpath, packageVersion, packageURL, options)`.
    5.  If the path of `parentURL` is empty or `/`, return.

### `const generator = resolve.packageSelf(packageName, packageSubpath, packageVersion, parentURL[, options])`

1.  For each value `packageURL` of `lookupPackageScope(parentURL, options)`:
    1.  Let `info` be the result of yielding `packageURL`.
    2.  If `info` is not `null`:
        1.  If `info.name` does not equal `packageName`, return.
        2.  Return `directory(packageSubpath, packageVersion, packageURL, options)`.

### `const generator = resolve.file(filename, parentURL[, options])`

1.  If `filename` equals `.` or `..`, or if `filename` ends with `/` or `\`, return.
2.  If `parentURL` has an opaque path, return.
3.  If `parentURL` is a `file:` URL and `filename` includes encoded `/` or `\`, throw.
4.  For each value `ext` of `options.extensions`:
    1.  If `filename` ends with `ext`, set `ext` to the empty string.
    2.  Yield the resolution of `filename` concatenated with `ext` relative to `parentURL`; if it resolves, return.

### `const generator = resolve.directory(dirname, version, parentURL[, options])`

1.  If `parentURL` has an opaque path, return.
2.  If `dirname` ends with `/` or `\`:
    1.  Let `directoryURL` be the resolution of `dirname` relative to `parentURL`.
3.  Otherwise:
    1.  Let `directoryURL` be the resolution of `dirname` concatenated with `/` relative to `parentURL`.
4.  Let `unversioned` be `true` if `version` is `null`, otherwise `false`.
5.  Let `info` be the result of yielding the resolution of `package.json` relative to `directoryURL`.
6.  If `info` is `null`, return.
7.  If `info.name` is a non-empty string:
    1.  If `info.name` includes `__`, throw.
    2.  Let `name` be `info.name` with every `/` replaced by `__` and any leading `@` removed.
8.  Otherwise, return.
9.  If `info.version` is a non-empty string:
    1.  If `version` is not `null` and `info.version` does not equal `version`, return.
    2.  Set `version` to `info.version`.
10. If `builtinTarget(name, version, options.builtins, options)` yields, return.
11. Let `native` be the values of `options.hosts` that do not start with `wasi-`, and `wasm` the values that do.
12. If `prebuilds(name, version, unversioned, directoryURL, native, options)` resolves, return.
13. If `linked(name, version, options)` resolves, return.
14. Return `prebuilds(name, version, unversioned, directoryURL, wasm, options)` with `options.extensions` set to `['.wasm']`.

#### `const generator = prebuilds(name, version, unversioned, directoryURL, hosts, options)`

1.  For each value `prebuildsURL` of `lookupPrebuildsScope(directoryURL, options)`:
    1.  Let `resolved` be `false`.
    2.  For each value `host` of `hosts`:
        1.  Let `conditions` be the result of splitting `host` on `-`.
        2.  If `host` is one of `darwin-arm64`, `darwin-x64`, `ios-arm64-simulator`, or `ios-x64-simulator`, let `universal` be `host` with its second component replaced by `universal`; otherwise let `universal` be `null`.
        3.  Append the values of `conditions` to `options.matchedConditions`.
        4.  If `version` is not `null`:
            1.  If `file(host + '/' + name + '@' + version, prebuildsURL, options)` resolves, set `resolved` to `true`.
            2.  If `universal` is not `null` and `file(universal + '/' + name + '@' + version, prebuildsURL, options)` resolves, set `resolved` to `true`.
        5.  If `unversioned` is `true`:
            1.  If `file(host + '/' + name, prebuildsURL, options)` resolves, set `resolved` to `true`.
            2.  If `universal` is not `null` and `file(universal + '/' + name, prebuildsURL, options)` resolves, set `resolved` to `true`.
        6.  Remove the values of `conditions` from `options.matchedConditions`.
    3.  If `resolved` is `true`, return.

### `const generator = resolve.linked(name, version[, options])`

1.  If `options.linked` is `false` or `options.hosts` is empty, return.
2.  For each value `host` of `options.hosts`:
    1.  Let `platform` be the substring of `host` until the first `-`.
    2.  If `platform` is the empty string, continue.
    3.  Append `platform` to `options.matchedConditions`.
    4.  Let `candidates` be the following artefact names, in order, where each entry containing `<version>` is only included when `version` is not `null`:
        1.  If `platform` is `darwin` or `ios`:
            1.  `<name>.<version>.framework/<name>.<version>`
            2.  `lib<name>.<version>.dylib`, only if `platform` is `darwin`
            3.  `<name>.framework/<name>`
            4.  `lib<name>.dylib`, only if `platform` is `darwin`
        2.  Otherwise, if `platform` is `linux` or `android`:
            1.  `lib<name>.<version>.so`
            2.  `lib<name>.so`
        3.  Otherwise, if `platform` is `win32`:
            1.  `<name>-<version>.dll`
            2.  `<name>.dll`
    5.  For each value `candidate` of `candidates`:
        1.  Yield `options.linkedProtocol` concatenated with `candidate`; if it resolves, stop iterating `candidates`.
    6.  Remove `platform` from `options.matchedConditions`.

## License

Apache-2.0
