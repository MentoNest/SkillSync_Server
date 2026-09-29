

## Handsoff notes

[![Backend CI](https://github.com/Drips-Network/SkillSync_Server/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/Drips-Network/SkillSync_Server/actions/workflows/backend-ci.yml)

<!-- handsoff-issue-1273 -->
- #1273: Event — PlatformFeeUpdated event

<!-- handsoff-issue-1274 -->
- #1274: Event — TreasuryUpdated event

<!-- handsoff-issue-1362 -->
- #1362: WebSocket gateway for real-time chat — JWT-authenticated `/chat` namespace, session-scoped rooms with membership checks, message persistence, typing indicators, read receipts, online status, 10 msg/min rate limit, file attachment fields, unread-count endpoints (total + per-partner), and an offline push-notification placeholder.

<!-- handsoff-issue-1363 -->
- #1363: Session scheduling system — transactional booking with `SELECT ... FOR UPDATE` participant locks plus DB exclusion constraints against double-booking, mentor availability checks, full status workflow (pending → confirmed → completed / cancelled / no_show), 24-hour cancellation policy with cancellation audit fields, session history for both roles, rating/review, and reminder placeholders delivered through the notification system.

<!-- handsoff-issue-1364 -->
- #1364: Notification system — JWT-authenticated `/notifications` WebSocket (fixes the unauthenticated `userId` handshake), 100/hour per-user rate limiting via the shared Redis limiter, in-app/email/push channel intent (SendGrid and push are placeholders), per-user opt-out preferences, paginated fetch, single + batch + mark-all read, and an automatic 90-day retention sweep on boot then daily (`NOTIFICATION_RETENTION_DAYS` to override).
