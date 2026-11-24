# @skillsync/api-client

Typed TypeScript client for the SkillSync REST API. The types in
[`src/schema.d.ts`](./src/schema.d.ts) are **generated from the backend OpenAPI
specification** (`backend/openapi/openapi.json`) — never edit them by hand.

## Regenerating

Whenever the backend API changes, regenerate the spec and then the client from the
repository root:

```bash
cd backend
npm run openapi:generate      # rebuilds openapi/openapi.json from the controllers
npm run api-client:generate   # rewrites api-client/src/schema.d.ts
```

A CI job (`.github/workflows/api-contract.yml`) fails the build if the committed spec or
client drift from what the controllers produce.

## Usage

```ts
import { createApiClient } from '@skillsync/api-client';

const request = createApiClient({
  baseUrl: 'https://api.skillsync.dev',
  getAccessToken: () => localStorage.getItem('accessToken') ?? undefined,
});

const me = await request('GET', '/users/me');
```

`request` is generic — pass the response type explicitly, or let it infer `unknown`:

```ts
import type { components } from '@skillsync/api-client';

const me = await request<components['schemas']['UserResponseDto']>('GET', '/users/me');
```

Because the endpoint paths are constrained to `keyof paths`, removing or renaming an
endpoint in the backend makes the frontend fail to compile instead of failing at runtime.
