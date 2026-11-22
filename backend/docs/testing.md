# Testing guide

## Unit tests

```bash
npm test
npm run test:cov
npm run test:ci
```

Unit tests live beside their subjects in `src/**/tests/*.spec.ts`. External systems are
stubbed with `jest.fn()` repositories and the in-memory `FakeRedisService`; no network or
real infrastructure is required.

Coverage gates are enforced by `npm run test:ci`:

- global: 80% statements, branches, functions and lines
- auth: 90%
- user: 85%
- availability: 80%

## End-to-end tests

The E2E suites need an isolated PostgreSQL database and Redis instance:

```bash
cp .env.test.example .env.test
docker compose -f docker-compose.test.yml up -d
npm run test:e2e
```

`TEST_DATABASE_URL` points the database-backed profile suite at the disposable database.
That suite drops and recreates the schema on startup and truncates it between tests, so it
must never be pointed at development or production data.

The auth suite uses an in-memory Redis stub with a controllable clock, which keeps nonce
expiry and replay tests deterministic and keeps the suite well under the 30-second budget.

## Pre-commit hooks

`npm install` installs Husky through the `prepare` script. On commit, lint-staged runs
`jest --findRelatedTests` for staged TypeScript files. The CI workflow in
`.github/workflows/tests.yml` runs the same suites with PostgreSQL and Redis service
containers and no skipped tests.
