# SkillSync Backend

NestJS backend for the SkillSync mentorship platform.

## Getting Started

```bash
cp .env.example .env   # fill in DB/Redis credentials
npm install
npm run start:dev      # hot-reload development server
```

| Script | Purpose |
| --- | --- |
| `npm run start:dev` | Development server with hot reload |
| `npm run build` | Compile to `dist/` (source maps enabled) |
| `npm run start:prod` | Run the compiled build |
| `npm run lint` / `lint:fix` | ESLint (flat config) |
| `npm run format` | Prettier |
| `npm run migration:*` | TypeORM migration CLI (generate/run/revert/show) |

## Architecture

```text
src/
├── config/          # Environment validation (Joi), app/database/flag configs
├── database/        # TypeORM module, data source (migration CLI), migrations
├── redis/           # Redis module: injectable service + connection config
├── health/          # Health endpoints (database + Redis connectivity)
├── common/          # Shared middleware, filters, guards, decorators
├── modules/         # Feature modules
├── app.module.ts    # Root module — config wiring
├── app.controller.ts
├── app.service.ts
└── main.ts          # Bootstrap: validation pipe, trust proxy, listen
```

### Conventions

- **Configuration** — every runtime knob comes from `process.env`, validated by
  Joi (`src/config/env.validation.ts`). Startup fails fast on missing or
  invalid values; production requires strong secrets and non-localhost CORS.
- **Feature flags** — `FEATURE_FLAG_*` booleans (`src/config/feature-flags.config.ts`)
  gate gradual rollouts per environment.
- **Path aliases** — `@/*` maps to `src/*`.
- **Pre-commit** — husky runs `lint-staged` (ESLint + Prettier) on staged files.
- **Source maps** — enabled in both `tsconfig.json` and `nest-cli.json` so
  production stack traces map back to TypeScript.

## Environment

See `.env.example` for the full list: application, auth (JWT), PostgreSQL
(`DB_*`), Redis (`REDIS_*`), and feature flags.
