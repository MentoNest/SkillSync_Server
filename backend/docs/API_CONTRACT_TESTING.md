# API contract testing

The OpenAPI document is generated from the code, validated in tests, and
diffed against the base branch on every pull request so a breaking change
cannot merge by accident.

## Pieces

| What | Where |
|------|-------|
| Spec generation (`@nestjs/swagger`) | `scripts/generate-openapi.ts` -> `docs/openapi.json` |
| Response-vs-spec validator | `src/common/openapi/openapi-validator.ts` |
| Breaking-change detector | `src/common/openapi/openapi-diff.ts` |
| Contract tests | `src/common/openapi/openapi-contract.spec.ts` |
| PR check | `openapi:check` step in `.github/workflows/ci.yml` |
| Client generation | `scripts/generate-api-client.sh` |

## Commands

```bash
npm run openapi:generate              # write docs/openapi.json
npm run openapi:check -- base.json head.json
npm run client:generate               # typed client for the frontend
```

## Workflow

1. Change an endpoint or DTO.
2. Run `npm run openapi:generate` and commit the updated `docs/openapi.json`.
3. CI regenerates the spec and compares it with the base branch's copy.

## What counts as breaking

Removing an endpoint or method, adding a required parameter, removing a 2xx
response or a response property, or making a request property required.
Adding endpoints, optional parameters and response properties is fine.

## Versioning policy

Breaking changes are not allowed within a version. Ship them under a new URL
version (`/api/v2/...`) and keep `/api/v1` working through the deprecation
window described in `docs/API_VERSIONING.md`.

## Using the validator in tests

```ts
const schema = responseSchemaFor(spec, '/users/{id}', 'get', 200);
expect(validateAgainstSchema(spec, schema, response.body)).toEqual([]);
```

## Frontend integration

Run `npm run client:generate` to emit types from the same spec; the frontend's
contract tests should import those types so a drifted response fails to compile.
