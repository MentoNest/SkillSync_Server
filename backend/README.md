[![CI](https://github.com/MentoNest/SkillSync_Server/actions/workflows/ci.yml/badge.svg)](https://github.com/MentoNest/SkillSync_Server/actions/workflows/ci.yml)

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## Security headers & CORS (#1470, #1471)

Helmet is applied globally in `src/main.ts` (CSP, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, XSS filter, HSTS in production, no `X-Powered-By`).

CORS is driven by `CORS_ORIGINS` (comma-separated). In non-production,
`http://localhost:3000` and `http://localhost:5173` are always allowed.
Credentials are enabled; preflight responds with 204.

## Health check (#1472)

`GET /health` is public (no JWT). It runs `SELECT 1` against Postgres and
`PING` against Redis. Response shape:

```json
{
  "status": "ok",
  "uptimeSeconds": 12,
  "timestamp": "2026-10-18T00:00:00.000Z",
  "components": {
    "database": { "status": "up", "latencyMs": 2 },
    "redis": { "status": "up", "latencyMs": 1 },
    "memory": { "status": "up", "message": "heap 40/64 MB" }
  }
}
```

Returns **503** if database or redis is down. Point Kubernetes probes here:

```yaml
livenessProbe:
  httpGet: { path: /health, port: 3000 }
readinessProbe:
  httpGet: { path: /health, port: 3000 }
```

## Demo data seed (#1474)

```bash
# one-off
npm run seed:demo

# or auto-run on boot
SEED_DEMO_DATA=true npm run start:dev
```

Creates **5 mentors** and **5 mentees** with deterministic wallets. Usernames
look like emails for easy recognition:

| Username | Role | Wallet (prefix) |
|----------|------|-----------------|
| `demo_mentor_1@example.com` … `_5@` | mentor | `GDEMO…0001`–`0005` |
| `demo_mentee_1@example.com` … `_5@` | mentee | `GDEMO…0011`–`0015` |

Idempotent and non-destructive: only demo wallets are upserted.


## Docker

See [docs/DOCKER.md](./docs/DOCKER.md). Quick start:

```bash
cp .env.example .env
docker compose up --build
```

## Metrics

Prometheus scrape endpoint: `GET /metrics`. See [docs/METRICS.md](./docs/METRICS.md).

## Production hardening

- Secrets only from environment (`validateEnv` at startup)
- Helmet, strict CORS (`CORS_ORIGINS`), Swagger disabled when `NODE_ENV=production`
- Rate limits: 50/min authenticated, 10/min anonymous in production
- Cookies: `HttpOnly`, `Secure` (prod), `SameSite=Strict`
- `TRUST_PROXY=true` when behind a reverse proxy
