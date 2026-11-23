# API Contract Testing

This document describes how the SkillSync backend keeps its HTTP contract — and the
frontend clients generated from it — in sync with the running API.

The goals are:

1. A machine-readable OpenAPI specification generated **from the code**, so it can never be
   hand-rot.
2. Tests that assert **real HTTP responses** match that specification.
3. A gate that fails pull requests which introduce **breaking** API changes.
4. A generated, typed **API client** for frontend consumption.

---

## 1. Generating the specification

The controllers are decorated with `@nestjs/swagger` annotations and the shared document
config lives in [`backend/src/swagger.config.ts`](../backend/src/swagger.config.ts). The
builders in `backend/scripts/` produce the committed spec from the same controllers the
server uses.

```bash
cd backend

# Write backend/openapi/openapi.json from the controllers
npm run openapi:generate

# Fail (exit 1) if the committed spec is stale — used in CI
npm run openapi:check
```

`openapi.json` is committed so reviewers can see contract changes in the diff and so the
breaking-change check has a baseline. **Whenever you change a controller or DTO, run
`openapi:generate` and commit the result.**

---

## 2. Response contract tests

The tests live in [`backend/test/contract/`](../backend/test/contract). Each
`*.contract-spec.ts` boots the full HTTP surface through a single Nest testing module
([`support/contract-app.ts`](../backend/test/contract/support/contract-app.ts)) wired to
in-memory service stubs and permissive guard stubs, issues real requests with `supertest`,
and validates each response against the spec using
[`jest-openapi`](https://github.com/openapi-contrib/jest-openapi):

```ts
import request from 'supertest';
import './support/openapi'; // registers the toSatisfyApiSpec matcher + spec path

const res = await request(app.getHttpServer()).get('/users/me');
expect(res.status).toBe(200);
expect(res).toSatisfyApiSpec();
```

`test/contract/support/openapi.ts` points `jest-openapi` at
`backend/openapi/openapi.json`, so **the tests and the published spec are always the same
document**.

Run them with:

```bash
cd backend
npm run test:contract
```

### Adding a contract test for a new endpoint

1. Add the endpoint's response schema(s) to its controller (`@ApiResponse({ type: ... })`).
2. Run `npm run openapi:generate`.
3. Add a case to the relevant `*.contract-spec.ts` that calls the endpoint and asserts
   `expect(res).toSatisfyApiSpec()` for each documented status code.

If a controller returns a body that the spec does not describe (or describes differently),
the test fails — that is the point.

---

## 3. Breaking-change detection

[`backend/scripts/check-breaking-changes.ts`](../backend/scripts/check-breaking-changes.ts)
uses [`openapi-diff`](https://github.com/OpenAPITools/openapi-diff) to compare a baseline
spec against the freshly generated one:

```bash
cd backend
npm run contract:breaking -- --base path/to/base-openapi.json
```

- If no `--base` is supplied (or the baseline file does not exist — e.g. the first release
  of the spec), the check is skipped so it never blocks the introducing PR.
- If breaking differences are found, it prints them and exits `1`.

See [api-versioning.md](./api-versioning.md) for what counts as breaking and how to bump
the version.

---

## 4. API client generation

The frontend consumes a generated, typed client in [`api-client/`](../api-client):

```bash
cd backend
npm run api-client:generate   # rewrites api-client/src/schema.d.ts
```

The client exposes a typed `request()` whose `path` argument is constrained to the
endpoints in the spec, so a contract change breaks the frontend build instead of failing at
runtime. See [`api-client/README.md`](../api-client/README.md).

---

## 5. CI integration

[`.github/workflows/api-contract.yml`](../.github/workflows/api-contract.yml) runs on every
push to `main` and on every pull request:

1. `npm run openapi:check` — the committed spec must match the code.
2. `npm run test:contract` — all response contract tests must pass.
3. On pull requests, `npm run contract:breaking` compares the PR's spec against the base
   branch's spec and fails on breaking changes.

This gates breaking changes at review time. Integration with the frontend is indirect but
hard: the frontend imports `@skillsync/api-client`, which is generated from the same spec,
so a breaking backend change fails the frontend's type-check.
