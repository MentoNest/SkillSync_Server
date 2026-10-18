# API versioning

The API uses URL path versioning: `/api/v1/...`, later `/api/v2/...`.

## Rules

- **Current version: v1.** Routes without an explicit `@Version()` are served
  at `/api/v1/...`.
- **Probes stay unversioned:** `/health` and `/metrics` are excluded from the
  `/api` prefix so Kubernetes and Prometheus keep working.
- **Unknown versions are a 404.** `/api/v9/...` does not exist, so it returns
  the standard not-found error envelope.
- **No breaking changes inside a version.** Removing an endpoint, adding a
  required parameter or removing a response field requires a new version. The
  OpenAPI contract check (`docs/API_CONTRACT_TESTING.md`) enforces this.

## Adding v2

Version a single controller or one method:

```ts
@Controller('sessions')
export class SessionsV2Controller {
  @Version('2')
  @Get()
  list() { /* new behaviour */ }
}
```

Add `'2'` to `SUPPORTED_API_VERSIONS` in `src/common/versioning/versioning.ts`.

## Deprecation timeline

1. Announce the deprecation and the removal date (minimum 6 months' notice).
2. Add the old version to `DEPRECATED_API_VERSIONS` with its sunset date.
   Responses then carry `Deprecation: true`, `Sunset: <date>` and a `Link` to
   this document.
3. After the sunset date remove the version from `SUPPORTED_API_VERSIONS` and
   delete its controllers.
