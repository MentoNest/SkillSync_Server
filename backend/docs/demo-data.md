# Demo data

Issue #1706 adds an idempotent CLI seed for local and staging environments. It creates ten demo accounts with complete mentor or mentee profiles, but it never creates sample sessions.

## Accounts

| Role   | Email                       | Username        |
| ------ | --------------------------- | --------------- |
| Mentor | `demo_mentor_1@example.com` | `demo_mentor_1` |
| Mentor | `demo_mentor_2@example.com` | `demo_mentor_2` |
| Mentor | `demo_mentor_3@example.com` | `demo_mentor_3` |
| Mentor | `demo_mentor_4@example.com` | `demo_mentor_4` |
| Mentor | `demo_mentor_5@example.com` | `demo_mentor_5` |
| Mentee | `demo_mentee_1@example.com` | `demo_mentee_1` |
| Mentee | `demo_mentee_2@example.com` | `demo_mentee_2` |
| Mentee | `demo_mentee_3@example.com` | `demo_mentee_3` |
| Mentee | `demo_mentee_4@example.com` | `demo_mentee_4` |
| Mentee | `demo_mentee_5@example.com` | `demo_mentee_5` |

Each mentor gets a bio, skills, expertise areas, an hourly rate in USD cents, languages, a mentee limit, education, certifications, and two weekly availability slots. Each mentee gets learning goals, interests, an experience level, a monthly budget, languages, education, and certifications. Names, bios, and goals are realistic faker values generated from a fixed seed, so they are stable across runs.

Wallets are valid Stellar Ed25519 public keys created with `Keypair.random().publicKey()` and stored through `normalizeWalletAddress`. The first run generates a wallet for each account; later runs find the same accounts by their deterministic email and username and reuse the existing wallets.

## Running the seed

Set the flag and run the script from `backend`:

```bash
SEED_DEMO_DATA=true npm run seed:demo
```

`SEED_DEMO_DATA` defaults to enabled. Setting it to `false` or `0` exits immediately without connecting to the database or writing anything. The CLI loads `.env` through `ConfigModule` and uses the normal `DB_*` environment variables via `buildDatabaseSettings`, so it uses the same database as the application.

## Safety

- Re-running the seed never duplicates users, profiles, roles, or availability slots.
- Non-demo users are never deleted or modified. If a real account already occupies a demo email or username, that identity is skipped with a warning.
- Existing demo users keep any extra roles and user-added availability slots.
- Only the `mentor` and `mentee` `RoleEntity` rows are ensured to exist; their permissions are not overwritten.
- Sample sessions are intentionally not created.
