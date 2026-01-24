/**
 * Session Lifecycle & Completion Documentation
 *
 * ## Overview
 * Sessions represent actual mentorship meetings tied to accepted bookings.
 * Sessions follow a strict lifecycle: scheduled → in_progress → completed
 *
 * ## Key Characteristics
 * - Auto-created when a booking is accepted
 * - 1:1 relationship with bookings (unique constraint on booking_id)
 * - Timestamps always match their source booking
 * - RBAC enforcement: mentee can start, mentor can complete
 * - Extensible for future features (reviews, notifications, analytics)
 *
 * ## Session States
 *
 * ### SCHEDULED
 * - Initial state when session is created from accepted booking
 * - Both mentor and mentee can transition to IN_PROGRESS
 *
 * ### IN_PROGRESS
 * - Session has been started by mentor or mentee
 * - Only mentor can transition to COMPLETED
 * - Mentee cannot complete sessions
 *
 * ### COMPLETED
 * - Session marked complete by mentor
 * - Triggers side-effects (unlocks reviews, sends notifications, etc.)
 * - Terminal state (no further transitions allowed)
 *
 * ## Allowed Transitions
 *
 * | From | To | Allowed For | Reason |
 * |------|-----|------------|--------|
 * | SCHEDULED | IN_PROGRESS | Mentee + Mentor | Either party can start |
 * | IN_PROGRESS | COMPLETED | Mentor Only | Only mentor confirms completion |
 * | SCHEDULED | COMPLETED | ✗ Blocked | Must go through IN_PROGRESS |
 * | COMPLETED | * | ✗ Blocked | Terminal state |
 * | IN_PROGRESS | SCHEDULED | ✗ Blocked | No state reversal allowed |
 *
 * ## Endpoint Summary
 *
 * ### Mentee Endpoints
 * - `PATCH /sessions/{id}/start` - Start a session (mentee or mentor role)
 * - `GET /sessions/mentee/my-sessions` - List mentee's sessions
 * - `GET /sessions/mentee/{id}` - Get session details
 *
 * ### Mentor Endpoints
 * - `PATCH /sessions/{id}/start` - Start a session (mentee or mentor role)
 * - `PATCH /sessions/{id}/complete` - Complete session (mentor only)
 * - `GET /sessions/mentor/my-sessions` - List mentor's sessions
 * - `GET /sessions/mentor/{id}` - Get session details
 *
 * ## Side-Effects on Completion
 *
 * When a session transitions to COMPLETED, the following prepare for future features:
 *
 * 1. **Review Eligibility** - Mentee can now leave reviews
 * 2. **Notifications** - Events triggered for both parties
 * 3. **Analytics** - Session completion logged for metrics
 * 4. **Webhooks** - External integrations notified
 *
 * These are currently stubbed and will be extended without modifying core logic.
 *
 * ## RBAC Enforcement
 *
 * ### Session Access
 * - Users can only access sessions they participate in
 * - Mentee can only see their own mentee sessions
 * - Mentor can only see their own mentor sessions
 * - Unauthorized access returns 403 Forbidden
 *
 * ### Session Transitions
 * - **START (scheduled → in_progress)**: Mentee OR Mentor
 * - **COMPLETE (in_progress → completed)**: Mentor ONLY
 * - Mentee attempting to complete returns 403 Forbidden
 *
 * ## Booking Integration
 *
 * Sessions are automatically created from accepted bookings:
 *
 * ```
 * Booking (DRAFT)
 *    ↓
 * Booking.accept()
 *    ↓
 * Booking (ACCEPTED) → Session auto-created
 *    ↓
 * Session (SCHEDULED)
 * ```
 *
 * **Important**: Sessions are NEVER created for:
 * - Draft bookings
 * - Declined bookings
 * - Cancelled bookings
 *
 * Session creation is internal and never exposed as a public/manual endpoint.
 *
 * ## Timestamp Guarantees
 *
 * Session timestamps MUST exactly match booking timestamps:
 * - `session.startTime = booking.startTime`
 * - `session.endTime = booking.endTime`
 *
 * No rescheduling or time modifications are allowed.
 *
 * ## Example Workflows
 *
 * ### Complete Happy Path
 *
 * 1. Mentee views booking → clicks "Request"
 * 2. Mentor receives notification → reviews booking
 * 3. Mentor clicks "Accept" → Session auto-created (SCHEDULED)
 * 4. Mentee clicks "Join" → `PATCH /sessions/{id}/start` → Session (IN_PROGRESS)
 * 5. Mentee and mentor have conversation
 * 6. Mentor clicks "End Session" → `PATCH /sessions/{id}/complete` → Session (COMPLETED)
 * 7. Mentee now eligible to leave review
 *
 * ### Declined Booking Path
 *
 * 1. Mentor views booking → clicks "Decline"
 * 2. Booking transitions to DECLINED
 * 3. No session is created
 * 4. Both parties notified
 *
 * ## API Response Format
 *
 * All session endpoints return SessionResponseDto:
 *
 * ```json
 * {
 *   "id": "550e8400-e29b-41d4-a716-446655440000",
 *   "bookingId": "550e8400-e29b-41d4-a716-446655440001",
 *   "mentorProfileId": "550e8400-e29b-41d4-a716-446655440002",
 *   "menteeUserId": "550e8400-e29b-41d4-a716-446655440003",
 *   "startTime": "2026-01-22T10:00:00Z",
 *   "endTime": "2026-01-22T11:00:00Z",
 *   "status": "in_progress",
 *   "notes": null,
 *   "metadata": null,
 *   "createdAt": "2026-01-22T08:00:00Z",
 *   "updatedAt": "2026-01-22T09:30:00Z"
 * }
 * ```
 *
 * ## Error Responses
 *
 * | Code | Scenario |
 * |------|----------|
 * | 400 | Invalid state transition (e.g., trying to complete SCHEDULED session) |
 * | 401 | Missing/invalid authentication headers |
 * | 403 | Insufficient permissions (e.g., mentee trying to complete) |
 * | 404 | Session or booking not found |
 *
 */

export const SESSION_SWAGGER_DOCUMENTATION = {
  tags: [
    {
      name: 'Sessions',
      description:
        'Session lifecycle management. Sessions represent actual mentorship meetings and are auto-created from accepted bookings.',
    },
  ],
};
