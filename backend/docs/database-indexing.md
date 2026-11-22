# Database Indexing & Query Performance (issue #1695)

This document records the query patterns behind the indexes added in
`src/database/migrations/1795180000000-AddPerformanceIndexes.ts` and how to
verify them.

## Index inventory

| Table | Index | Query served |
|-------|-------|--------------|
| `users` | `idx_users_wallet_status` | wallet auth lookup + status guard |
| `users` | `idx_users_role_status_created` | admin filter by role/status, newest first |
| `users` | `idx_users_status_role_created` | admin filter by status/role, newest first |
| `users` | `idx_users_wallet_address`, `idx_users_status`, `idx_users_created_at` | existing single-column lookups |
| `mentor_profiles` | `idx_mentor_verified_rating` | discovery: verified mentors ordered by rating |
| `mentor_profiles` | `idx_mentor_discovery` | active + verified + rating sort |
| `mentee_profiles` | `idx_mentee_wallet_active`, `idx_mentee_active_experience` | profile lookups and discovery filters |
| `availability_slots` | `idx_availability_slots_mentor_day` / `..._day_time` | weekly slot checks |
| `availability_exceptions` | `idx_availability_exceptions_mentor_date` / `..._unavailable` | date overlap checks |
| `profile_history` | `idx_ph_user_changed`, `idx_ph_user_type_changed`, `idx_ph_reason_changed` | history timeline queries |
| `portfolio_links` | `idx_portfolio_links_wallet_created`, `idx_portfolio_links_platform` | list and platform filters |
| `user_roles` | `idx_user_roles_wallet`, `idx_user_roles_role`, `idx_user_roles_role_wallet` | join-table FK lookups |

Every foreign-key column (`wallet_address`, `mentor_id`, `user_id`, `role_name`)
is covered by at least one index. Composite columns are ordered by equality
predicates first and range/order columns last.

## Verifying with EXPLAIN ANALYZE

Run against a database with realistic data. An index-only or bitmap index scan
is expected; a sequential scan on a large table means the index is not being
used.

```sql
EXPLAIN ANALYZE
SELECT wallet_address, status, created_at
  FROM users
 WHERE role = 'mentor' AND status = 'active'
 ORDER BY created_at DESC
 LIMIT 20;

EXPLAIN ANALYZE
SELECT id, average_rating
  FROM mentor_profiles
 WHERE is_verified = true AND is_active = true
 ORDER BY average_rating DESC
 LIMIT 20;

EXPLAIN ANALYZE
SELECT id, start_time_utc
  FROM availability_slots
 WHERE mentor_id = 'GDQ...' AND day_of_week = 1
 ORDER BY start_time_utc;
```

After deploying, refresh planner statistics:

```sql
ANALYZE users;
ANALYZE mentor_profiles;
ANALYZE mentee_profiles;
ANALYZE availability_slots;
ANALYZE availability_exceptions;
```

## Slow query log

Enable sampling of statements slower than 100 ms:

```sql
ALTER DATABASE skillsync SET log_min_duration_statement = 100;
```

Review with `pg_stat_statements`:

```sql
SELECT calls, round(mean_exec_time::numeric, 2) AS mean_ms, query
  FROM pg_stat_statements
 WHERE mean_exec_time > 100
 ORDER BY mean_exec_time DESC
 LIMIT 20;
```

The acceptance target is at least a 50% reduction in mean execution time for
the common queries above. Compare `mean_exec_time` before and after deploying
the migration; rebuild statistics with `ANALYZE` before measuring.

## Reverting

`npm run migration:revert` drops the indexes in reverse order and removes the
`role`, `is_verified` and `average_rating` columns.
