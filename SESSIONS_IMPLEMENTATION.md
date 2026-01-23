# Session Lifecycle Management

## Overview

Sessions represent actual mentorship meetings and are strictly derived from accepted bookings. This module implements a complete session lifecycle with enforcement at both database and application levels.

## Architecture

### Entity Relationships

```
Booking (1) ←→ (1) Session
   ↓                  ↓
   └─ MentorProfile   ├─ MentorProfile
   └─ User (mentee)   ├─ User (mentee)
   └─ Listing         └─ Timestamps match exactly
```

### Session Lifecycle States

```
SCHEDULED ──→ IN_PROGRESS ──→ COMPLETED
   ↓              ↓              ↓
Auto-created    Either party    Mentor only
from booking     can start       can complete
```

## Key Features

### 1. **Automatic Creation from Accepted Bookings**
- Sessions are created automatically when a booking transitions to ACCEPTED status
- Session creation is never exposed as a public endpoint
- **Constraint**: If session already exists for booking, creation is rejected

### 2. **1:1 Relationship with Bookings**
- Database enforces unique constraint on `booking_id`
- Each booking can have at most one session
- Sessions only exist for ACCEPTED bookings

### 3. **Strict Lifecycle Enforcement**
- **State Validation**: Only allowed transitions are permitted
- **No Reversals**: Cannot revert from completed or skip intermediate states
- **Terminal States**: COMPLETED sessions cannot transition further

### 4. **RBAC & Ownership Enforcement**
- **Mentee**: Can view their sessions, start sessions
- **Mentor**: Can view their sessions, start sessions, complete sessions
- **Isolation**: Users cannot access sessions they don't participate in

### 5. **Timestamp Guarantees**
- Session timestamps MUST exactly match booking timestamps
- No rescheduling or time modifications allowed
- Timestamps are copied at session creation and never modified

### 6. **Completion Side-Effects**
- Extensible hook system for future features
- Currently stubbed for:
  - Review eligibility
  - Notifications
  - Analytics
  - Webhooks

## Database Schema

### Sessions Table

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL UNIQUE,
  mentor_profile_id UUID NOT NULL,
  mentee_user_id UUID NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  status ENUM('scheduled', 'in_progress', 'completed') NOT NULL,
  notes TEXT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  
  -- Constraints
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (mentor_profile_id) REFERENCES mentor_profiles(id),
  FOREIGN KEY (mentee_user_id) REFERENCES users(id),
  
  -- Indexes
  UNIQUE INDEX (booking_id),
  INDEX (mentor_profile_id),
  INDEX (mentee_user_id),
  INDEX (status),
  INDEX (start_time)
);
```

### Bookings Table

```sql
CREATE TABLE bookings (
  id UUID PRIMARY KEY,
  listing_id UUID NOT NULL,
  mentor_profile_id UUID NOT NULL,
  mentee_user_id UUID NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  status ENUM('draft', 'accepted', 'declined', 'cancelled') NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  
  -- Constraints
  FOREIGN KEY (listing_id) REFERENCES listings(id),
  FOREIGN KEY (mentor_profile_id) REFERENCES mentor_profiles(id),
  FOREIGN KEY (mentee_user_id) REFERENCES users(id),
  
  -- Indexes
  INDEX (listing_id),
  INDEX (mentor_profile_id),
  INDEX (mentee_user_id),
  INDEX (status),
  INDEX (start_time)
);
```

## API Endpoints

### Session Transitions

#### Start Session
```
PATCH /sessions/{id}/start
Headers:
  - x-user-id: {menteeUserId} OR
  - x-mentor-profile-id: {mentorProfileId}

Response: 200 OK (SessionResponseDto with status: in_progress)
Errors:
  - 400: Session not in SCHEDULED state
  - 403: User not part of session
  - 404: Session not found
```

#### Complete Session (Mentor Only)
```
PATCH /sessions/{id}/complete
Headers:
  - x-mentor-profile-id: {mentorProfileId}

Response: 200 OK (SessionResponseDto with status: completed)
Errors:
  - 400: Session not in IN_PROGRESS state
  - 403: Not the session mentor
  - 404: Session not found
```

### Session Retrieval

#### Get Mentee Sessions
```
GET /sessions/mentee/my-sessions
GET /sessions/mentee/{id}

Headers: x-user-id: {menteeUserId}
Response: 200 OK (SessionResponseDto[])
```

#### Get Mentor Sessions
```
GET /sessions/mentor/my-sessions
GET /sessions/mentor/{id}

Headers: x-mentor-profile-id: {mentorProfileId}
Response: 200 OK (SessionResponseDto[])
```

## Service Implementation

### SessionsService

**Key Methods:**

- `createFromBooking(bookingId)` - Auto-called on booking acceptance
- `startSession(id, userId, mentorProfileId)` - Transition to IN_PROGRESS
- `completeSession(id, mentorProfileId)` - Transition to COMPLETED
- `findMenteeSession(userId, sessionId)` - Retrieve mentee's sessions
- `findMentorSession(mentorProfileId, sessionId)` - Retrieve mentor's sessions

**Enforcements:**

- Session auto-creation validates booking status is ACCEPTED
- Duplicate creation is prevented via unique constraint
- All transitions validate state before proceeding
- All access is guarded by ownership checks

### BookingsService

**Integration Points:**

- `acceptBooking(bookingId)` - Transitions booking to ACCEPTED and triggers session creation
- `declineBooking(bookingId)` - Transitions booking to DECLINED (no session creation)
- `cancelBooking(bookingId)` - Prevents cancellation of ACCEPTED bookings with sessions

## Testing

### Unit Tests (sessions.service.spec.ts)
- Session auto-creation from bookings
- Session prevention for non-accepted bookings
- Duplicate session prevention
- Mentee/mentor access control
- State transition validation
- Timestamp correctness

### Integration Tests (sessions.integration.spec.ts)
- Complete lifecycle workflows
- RBAC enforcement across operations
- State transition sequences
- Timestamp matching
- Ownership isolation

### E2E Tests (sessions.e2e-spec.ts)
- API endpoint behavior
- Request/response validation
- Error handling
- Authorization headers

## Lifecycle Example

### Happy Path: Booking to Session Completion

```
1. Mentee creates booking request
   → Booking status: DRAFT

2. Mentor accepts booking
   → Booking status: ACCEPTED
   → Session auto-created (status: SCHEDULED)

3. Mentee joins session
   → PATCH /sessions/{id}/start
   → Session status: IN_PROGRESS

4. Session conversation occurs
   (both parties have access to session details)

5. Mentor ends session
   → PATCH /sessions/{id}/complete
   → Session status: COMPLETED
   → Triggers completion hooks

6. Mentee now eligible for review
   (future feature, currently stubbed)
```

### Declined Path: No Session Created

```
1. Mentee creates booking request
   → Booking status: DRAFT

2. Mentor declines booking
   → Booking status: DECLINED
   → No session created
   → Mentee notified
```

## Error Handling

| Error | Status | Reason |
|-------|--------|--------|
| Session not found | 404 | Invalid session ID |
| Booking not found | 404 | Booking doesn't exist |
| Invalid transition | 400 | State change not allowed (e.g., scheduled→completed) |
| Unauthorized access | 403 | User not part of session |
| Duplicate session | 400 | Session already exists for booking |
| Not mentor | 403 | Mentee attempting mentor-only action |
| Session state invalid | 400 | Session not in expected state for transition |

## Future Extensions

### Prepared Hooks (Stubbed)
These are extensible without modifying core logic:

1. **Review System**
   - Unlock review eligibility on COMPLETED
   - Trigger review invitation notifications

2. **Notifications**
   - Send completion confirmations
   - Update session status in real-time

3. **Analytics**
   - Log session completion metrics
   - Track mentor availability patterns

4. **Webhooks**
   - Dispatch external integrations
   - Support third-party platforms

### Extension Pattern

```typescript
private async onSessionCompleted(session: Session): Promise<void> {
  // Future implementations will extend here without touching core logic
  
  // Example:
  // await this.eventBus.emit('session.completed', { sessionId: session.id });
  // await this.reviewsService.unlockReviewEligibility(session.id);
  // await this.notificationsService.notifySessionCompleted(session.menteeUserId);
}
```

## Security Considerations

### Database-Level Guarantees
- Unique constraint on booking_id prevents duplicates
- Foreign key constraints enforce referential integrity
- Indexes on access patterns for query efficiency

### Application-Level Guarantees
- Ownership validation on every endpoint
- State validation before transitions
- Authorization checks in controllers and services
- No manual session creation endpoints

### Data Isolation
- Users only see sessions they participate in
- Mentors only see their mentee sessions
- Mentees only see their mentor sessions

## Configuration

### Environment Variables
None required. Sessions inherit auth from existing guards and decorators.

### Dependencies
- TypeORM for persistence
- NestJS for framework
- PostgreSQL for database

## Migration

### Running Migrations
```bash
npm run migration:run
```

### Reverting Migrations
```bash
npm run migration:revert
```

## Support & Maintenance

### Adding New Features
1. Extend `onSessionCompleted()` hook instead of modifying transitions
2. Keep business logic in SessionsService isolated
3. Update tests for new requirements
4. Document changes in this README

### Monitoring
- Track session state transitions in logs
- Monitor for invalid transition attempts
- Alert on access violations
- Measure session completion rates

## API Documentation

Full Swagger documentation available at: `/api/docs`

Search for "Sessions" tag to see all endpoints with complete request/response examples.
