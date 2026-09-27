# Authentication

Wallet login, access tokens and refresh tokens. Covers issues #1313 (nonce
challenge), #1314 (signature verification), #1315 (access tokens) and #1316
(refresh token rotation).

## Flow

```
GET  /auth/nonce/:walletAddress   -> { nonce, expiresAt }      #1313
POST /auth/login                  -> { accessToken, refreshToken, expiresIn, ... }  #1314
POST /auth/refresh                -> { accessToken, refreshToken, ... }  #1316
```

1. The client asks for a challenge. It is 256 bits from `crypto.randomBytes`,
   stored in Redis under `nonce:{walletAddress}` with a 5 minute TTL, and it
   replaces any previous unused challenge for that wallet.
2. The client signs the nonce with its wallet and posts
   `{ walletAddress, nonce, signature, network }`. The challenge is taken out of
   Redis with a single atomic `GETDEL`, so it can back exactly one verification
   attempt. Expiry, purpose and nonce equality are checked before the Ed25519
   signature, and the nonce comparison is constant time. Any failure is 401 and
   is audit logged together with the geo location of the attempt.
3. Both `G...` and SEP-23 `M...` (muxed) addresses are accepted: the Ed25519
   key is recovered from the muxed payload, so a muxed address and its
   underlying `G` account are interchangeable for login.

## Token contract

Access and refresh tokens share the core claims; `typ` tells them apart, so an
access token can never be presented to `/auth/refresh`.

| Claim          | Meaning                                                        |
|----------------|----------------------------------------------------------------|
| `sub`          | user id                                                        |
| `wallet`       | Stellar address of the account                                 |
| `roles`        | role names the user holds                                       |
| `permissions`  | effective permissions (`*` for admin)                          |
| `jti`          | unique token id, correlates a token with an audit entry        |
| `tokenVersion` | bumped whenever the account's authority changes                |
| `typ`          | `access` or `refresh`                                          |
| `iss`/`aud`    | from `JWT_ISSUER` / `JWT_AUDIENCE`, verified on every request   |
| `iat`/`exp`    | issued at / expiry, set by the signer                          |

A token whose `tokenVersion` no longer matches the user row is rejected, so a
role change or a password-equivalent event invalidates the tokens already in the
wild.

## Refresh rotation

* every successful `/auth/refresh` issues a **new** refresh token and revokes the
  presented one, linking them through `replacedById`;
* tokens descending from one login share a `familyId`;
* presenting an already rotated token is treated as a compromise: the family and
  every other session of that user are revoked, `tokenVersion` is bumped and a
  `refresh_token_reuse_detected` audit event is written;
* user agent and IP prefix are hashed into `deviceInfo`; a refresh from a
  different device sets `deviceChanged` in the response;
* an unknown, expired, revoked or replayed token all produce the same 401, so
  the endpoint cannot be used to probe which tokens exist.

## Environment

| Variable                              | Default            | Purpose                                  |
|---------------------------------------|--------------------|------------------------------------------|
| `JWT_SECRET`                          | –                  | HS256 signing secret                     |
| `JWT_ALGORITHM`                       | `HS256`            | `HS256` or `RS256`                       |
| `JWT_PRIVATE_KEY`                     | –                  | PEM RSA private key, required for RS256  |
| `JWT_PUBLIC_KEY`                      | derived            | PEM RSA public key                       |
| `JWT_ISSUER`                          | `skillsync`        | `iss` claim                              |
| `JWT_AUDIENCE`                        | `skillsync-api`    | `aud` claim                              |
| `JWT_ACCESS_EXPIRATION`               | `15m`              | Access token lifetime (15-60m advised)   |
| `JWT_REFRESH_EXPIRATION_DAYS`         | `30`               | Refresh token lifetime (7-30 days)       |
| `NONCE_TTL_SECONDS`                   | `300`              | Challenge lifetime                       |
| `NONCE_RATE_LIMIT_MAX`                | `5`                | Challenges per minute per wallet         |
| `WALLET_LOGIN_RATE_LIMIT_MAX`         | `10`               | Login attempts per window per wallet     |
| `WALLET_LOGIN_RATE_LIMIT_WINDOW_SECONDS` | `900`           | Login attempt window                     |
| `REFRESH_REUSE_ALERT`                 | `true`             | Alert on refresh token reuse             |

Durations accept `s`, `m`, `h` and `d` suffixes (`900`, `15m`, `1h`, `7d`).
`RS256` without `JWT_PRIVATE_KEY` is a hard failure - the service will not
silently fall back to `HS256`.

## Migration

`1725000000021-AddRefreshTokenRotation` adds `jti`, `familyId`, `replacedById`,
`usedAt` and `revocationReason` to `refresh_tokens` and widens `token` to hold a
fully populated refresh JWT. The columns are nullable, so rows written before the
migration keep working and are treated as a family of one.

## Tests

```bash
npx vitest run src/auth/services/nonce.service.spec.ts \
               src/auth/services/access-token.service.spec.ts \
               src/auth/services/refresh-token.service.spec.ts \
               src/auth/strategies/wallet.strategy.spec.ts
```
