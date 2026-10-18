-- Index verification for #1463.
--
-- Run against a representative (non-empty) dataset, ideally a copy of
-- production with the same row counts, and confirm every plan uses an Index
-- Scan or Index Only Scan rather than a Seq Scan.
--
--   psql "$DATABASE_URL" -f scripts/index-verification.sql
--
-- A Seq Scan is acceptable while a table is small — Postgres will not use an
-- index until the table is large enough for a sequential pass to cost more.
-- The check that matters is behaviour at production cardinality.

--------------------------------------------------------------------------------
-- users: (walletAddress, status) — auth lookup
--------------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT "id", "status"
FROM "users"
WHERE "walletAddress" = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
  AND "status" = 'active';

-- expect: IDX_users_wallet_address_status
-- note:  IDX_users_wallet_address is a unique index on walletAddress alone, so
--        this may resolve through either. That is fine — the composite index
--        matters for queries that filter on status without pinning the wallet,
--        and keeps the planner from degrading to a filter after the lookup.

--------------------------------------------------------------------------------
-- users: (status, createdAt) — directory listing
--------------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT "id", "displayName"
FROM "users"
WHERE "status" = 'active'
  AND "deletedAt" IS NULL
ORDER BY "createdAt" DESC
LIMIT 20;

-- expect: IDX_users_status_created_at

--------------------------------------------------------------------------------
-- user_roles: role filter for directory listing
--------------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT u."id"
FROM "user_roles" ur
JOIN "users" u ON u."id" = ur."user_id"
WHERE ur."role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'mentor')
  AND u."status" = 'active'
ORDER BY u."createdAt" DESC
LIMIT 20;

-- expect: IDX_user_roles_role_user on the join table

--------------------------------------------------------------------------------
-- mentor_profiles: (isVerified, averageRating) — discovery ranking
--------------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT "id", "average_rating", "review_count"
FROM "mentor_profiles"
WHERE "is_verified" = true
ORDER BY "average_rating" DESC
LIMIT 20;

-- expect: IDX_mentor_profiles_verified_rating

--------------------------------------------------------------------------------
-- availability_slots: (mentorId, dayOfWeek) — weekly availability check
--------------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT "start_time", "end_time", "timezone"
FROM "availability_slots"
WHERE "mentor_id" = '00000000-0000-4000-8000-000000000000'
  AND "day_of_week" = 3;

-- expect: IDX_availability_slots_mentor_day

--------------------------------------------------------------------------------
-- refresh_tokens: (userId, revokedAt) — logout / revoke-all
--------------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT "id"
FROM "refresh_tokens"
WHERE "userId" = '00000000-0000-4000-8000-000000000000'
  AND "revokedAt" IS NULL;

-- expect: IDX_refresh_tokens_user_revoked

--------------------------------------------------------------------------------
-- refresh_tokens: (familyId, revokedAt) — rotation
--------------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT "id"
FROM "refresh_tokens"
WHERE "familyId" = '00000000-0000-4000-8000-000000000000'
  AND "revokedAt" IS NULL;

-- expect: IDX_refresh_tokens_family_revoked

--------------------------------------------------------------------------------
-- user_suspensions: (userId, active) — login check
--------------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT "id", "reason", "suspended_until"
FROM "user_suspensions"
WHERE "user_id" = '00000000-0000-4000-8000-000000000000'
  AND "active" = true;

-- expect: IDX_user_suspensions_user_active

--------------------------------------------------------------------------------
-- mentor_verification_requests: (status, createdAt) — admin review queue
--------------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT "id", "mentor_id", "note"
FROM "mentor_verification_requests"
WHERE "status" = 'pending'
ORDER BY "created_at" ASC
LIMIT 50;

-- expect: IDX_mentor_verification_requests_status_created

--------------------------------------------------------------------------------
-- Slow-query log check (#1463)
--
-- Postgres does not log slow queries by default. To enable it, set in
-- postgresql.conf and reload:
--
--   log_min_duration_statement = 100   -- ms
--   log_statement = 'all'              -- only while investigating
--
-- then inspect:
--
--   SELECT duration, left(query, 120) AS query
--   FROM pg_stat_activity
--   WHERE state = 'active' AND now() - query_start > interval '100 milliseconds'
--   ORDER BY duration DESC;
--
-- A duration of 0ms in pg_stat_statements means the plan was served from
-- cache; those are the queries to watch for index-only scan regressions.
--------------------------------------------------------------------------------