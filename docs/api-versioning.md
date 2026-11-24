# API Versioning Policy

SkillSync follows [Semantic Versioning](https://semver.org/) for its public HTTP API. The
current version is declared once, in code:

```ts
// backend/src/swagger.config.ts
export const API_VERSION = '1.0';
```

That value is written into the generated OpenAPI document (`info.version`) every time the
spec is regenerated, so the published contract always carries the version it belongs to.

## What the numbers mean

Given a version `MAJOR.MINOR`:

| Change | Version bump | Examples |
| ------ | ------------ | -------- |
| **Breaking** | `MAJOR` | Removing/renaming an endpoint, request field or response field; changing a field's type; making an optional request field required; tightening a validation rule; removing an enum value; changing an error status code for an existing condition. |
| **Backward-compatible** | `MINOR` | Adding a new endpoint; adding an optional request field; adding new response fields; adding a new enum value that clients are expected to tolerate; adding an optional query parameter. |
| **Non-functional** | *(none)* | Documentation, summaries, examples, internal refactors that leave the wire format unchanged. |

Adding a new **required** response field is also breaking for strict clients, so treat any
change that could break generated clients as `MAJOR`.

## How a bump is applied

1. Make the API change in the controllers/DTOs.
2. Update `API_VERSION` in [swagger.config.ts](../backend/src/swagger.config.ts) according
   to the table above.
3. Regenerate the spec and the client:

   ```bash
   cd backend
   npm run openapi:generate
   npm run api-client:generate
   ```

4. Document the change (and any migration steps) in the pull request description.

The maintained baseline lives in the repository as
`backend/openapi/openapi.json`. Pull requests are compared against the target branch's copy
of that file; see [contract-testing.md](./contract-testing.md) for the automated
breaking-change gate.

## Deprecation

There is no separate deprecation window yet (pre-1.0 consumers). When one is introduced,
the policy will be: mark the operation/field as deprecated in Swagger
(`@ApiOperation({ deprecated: true })` / `@ApiProperty({ deprecated: true })`), keep it
working for at least one `MINOR` release, and only remove it in the next `MAJOR` release.
