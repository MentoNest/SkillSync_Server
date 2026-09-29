# Production Deployment Security

The backend requires an explicit `NODE_ENV`; set it to `production` in the deployment environment. Startup validation rejects missing/weak JWT, encryption, and search-hash secrets, missing database credentials, an empty CORS allowlist, or RS256 without a private key. Swagger UI is disabled in production; Helmet security headers and a restrictive content security policy are enabled.

## Required environment

Provide secrets through the deployment secret manager, not source control or image build arguments:

```dotenv
NODE_ENV=production
JWT_ALGORITHM=HS256
JWT_SECRET=<at-least-32-random-characters>
ENCRYPTION_KEY=<64-hex-characters>
SEARCH_HASH_SALT=<at-least-32-random-characters>
DB_HOST=<private-database-host>
DB_PORT=5432
DB_USERNAME=<database-user>
DB_PASSWORD=<database-password>
DB_DATABASE=skillsync
CORS_ORIGINS=https://skillsync.example.com,https://staging.skillsync.example.com
```

Generate independent secret values, for example with `openssl rand -base64 48` for `JWT_SECRET` and `SEARCH_HASH_SALT`, and `openssl rand -hex 32` for `ENCRYPTION_KEY`. Do not reuse one secret for multiple purposes. With `JWT_ALGORITHM=RS256`, also provide `JWT_PRIVATE_KEY`.

## Proxy, cookies, and limits

When deployed behind a reverse proxy, set `TRUST_PROXY` to the exact trusted proxy hop count or trusted subnet expression, such as `1` for exactly one proxy. Do not set it to `true`; trusting arbitrary forwarded headers enables IP spoofing. Leave it empty when the server receives client connections directly.

Successful login and refresh responses retain their JSON tokens and also set `accessToken` and `refreshToken` cookies with `HttpOnly`, `SameSite=Strict`, and `Secure` outside development/test. Configure HTTPS at the proxy so production cookies are delivered securely.

Production global rate limits are 50 requests/minute for Bearer-authenticated requests and 10 requests/minute otherwise. Route-specific limits may be stricter but cannot raise these caps. Trusted-IP bypasses are disabled in production.

CORS allowed origins and deployment values are described in [cors.md](cors.md). Keep production frontend origins explicit and never use `*` with credentialed requests.
