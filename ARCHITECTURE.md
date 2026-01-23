# Session & Booking Architecture

## Module Dependency Graph

```
AppModule
├── ConfigModule
├── DatabaseModule
├── HealthModule
├── UsersModule
├── MentorProfilesModule
├── SkillsModule
├── ListingsModule
├── SessionsModule (independent)
│   ├── SessionsService (orchestrates Session lifecycle)
│   ├── SessionsController (API endpoints)
│   └── TypeOrmModule.forFeature([Session, Booking])
│
└── BookingsModule (depends on SessionsModule)
    ├── BookingsService (handles Booking state)
    ├── BookingLifecycleOrchestrator (coordinates Booking + Session)
    └── TypeOrmModule.forFeature([Booking])
    └── SessionsModule (re-exported)
```

## Key Design Decisions

### 1. **Separation of Concerns**

Each service has a single responsibility:

| Service | Responsibility |
|---------|-----------------|
| `SessionsService` | Session lifecycle (state transitions, validation, retrieval) |
| `BookingsService` | Booking state transitions (accept, decline, cancel) |
| `BookingLifecycleOrchestrator` | Coordinates booking acceptance → session creation |

### 2. **Avoiding Circular Dependencies**

The orchestrator pattern cleanly breaks potential circular dependencies:

**Before (would create circular dependency):**
```
BookingsService → SessionsService
    ↑                    ↓
    └────────────────────┘
```

**After (clean one-way dependency):**
```
BookingsService ─→ BookingLifecycleOrchestrator ←─ SessionsService
```

Both services are independent; the orchestrator coordinates them.

### 3. **Module Import Order**

NestJS resolves the dependency graph based on import order in AppModule:

```typescript
SessionsModule     // Imported first (no dependencies)
    ↓
BookingsModule     // Imported after (depends on SessionsModule)
```

This ensures SessionsModule providers are available when BookingsModule needs them.

### 4. **No Tight Coupling**

- **SessionsService** knows nothing about Bookings or orchestration
- **BookingsService** knows nothing about Sessions or orchestration
- **BookingLifecycleOrchestrator** knows about both but doesn't implement core logic

This design allows:
- Changing SessionsService without affecting BookingsService
- Using SessionsService independently in other contexts
- Testing each service in isolation

## Data Flow

### Booking Acceptance Flow

```
1. Controller receives booking acceptance request
   ↓
2. BookingLifecycleOrchestrator.acceptBooking(bookingId)
   ├─ BookingsService.acceptBooking(bookingId)
   │  └─ Update Booking status: DRAFT → ACCEPTED
   │  └─ Save to database
   │
   └─ SessionsService.createFromBooking(bookingId)
      ├─ Fetch Booking (verify status is ACCEPTED)
      ├─ Check for duplicate session
      ├─ Create Session with Booking timestamps
      └─ Save to database
```

### State Management

**Booking States:**
```
DRAFT → ACCEPTED → Session Created
      → DECLINED → No Session
      → CANCELLED (only if DRAFT)
```

**Session States:**
```
SCHEDULED → IN_PROGRESS → COMPLETED
  (created)   (started)    (ended)
```

## API Contract

### Endpoints

**Session Transitions:**
- `PATCH /sessions/{id}/start` - Both mentee and mentor can start
- `PATCH /sessions/{id}/complete` - Mentor only

**Session Retrieval:**
- `GET /sessions/mentee/my-sessions` - Mentee list
- `GET /sessions/mentee/{id}` - Mentee detail
- `GET /sessions/mentor/my-sessions` - Mentor list
- `GET /sessions/mentor/{id}` - Mentor detail

### Authorization Headers

- Mentee: `x-user-id: {userId}`
- Mentor: `x-mentor-profile-id: {mentorProfileId}`

## Database Schema

### Foreign Key Relationships

```
bookings
├── listing_id → listings.id
├── mentor_profile_id → mentor_profiles.id
└── mentee_user_id → users.id

sessions
├── booking_id → bookings.id (UNIQUE)
├── mentor_profile_id → mentor_profiles.id
└── mentee_user_id → users.id
```

### Constraints

| Constraint | Purpose |
|-----------|---------|
| `sessions.booking_id` UNIQUE | Prevent duplicate sessions per booking |
| `sessions.booking_id` NOT NULL | Every session must have a booking |
| `bookings.status` ENUM | Enforce valid booking states |
| `sessions.status` ENUM | Enforce valid session states |

## Testing Strategy

### Unit Tests
- **SessionsService** - Lifecycle transitions, RBAC, ownership
- **BookingsService** - State transitions, validation
- **BookingLifecycleOrchestrator** - Coordination, error handling

### Integration Tests
- Complete workflows (booking → session → completion)
- Error scenarios and rollback
- Timestamp correctness

### E2E Tests
- API endpoint behavior
- Request/response validation
- Authorization enforcement

## Error Handling

### Common Errors

| Error | Cause | HTTP Status |
|-------|-------|------------|
| Session not found | Invalid session ID | 404 |
| Unauthorized | Missing/invalid auth header | 401 |
| Forbidden | Insufficient permissions (not mentor/mentee) | 403 |
| Bad Request | Invalid state transition | 400 |
| Conflict | Duplicate session creation | 409 |

### Error Flow

```
Request
  ↓
Authorization Check (401/403)
  ↓
Resource Lookup (404)
  ↓
Business Logic Validation (400/409)
  ↓
State Transition (400)
  ↓
Database Operation (500)
  ↓
Response
```

## Extension Points

### Future Features (Hooks Prepared)

1. **Review System**
   - Hook: `onSessionCompleted()`
   - Unlocks review eligibility

2. **Notifications**
   - Hook: `onSessionCompleted()`
   - Send emails, push notifications

3. **Analytics**
   - Hook: `onSessionCompleted()`
   - Track metrics, patterns

4. **Webhooks**
   - Hook: `onSessionCompleted()`
   - Dispatch external systems

All extensions use the existing `onSessionCompleted()` hook without modifying core logic.

## Performance Considerations

### Indexes
- `sessions.booking_id` (unique) - Fast lookup for duplicate prevention
- `sessions.mentor_profile_id` - Fast mentor session queries
- `sessions.mentee_user_id` - Fast mentee session queries
- `sessions.status` - Fast filtering by state

### Query Patterns
```sql
-- Common queries (covered by indexes)
SELECT * FROM sessions WHERE booking_id = $1;
SELECT * FROM sessions WHERE mentor_profile_id = $1 ORDER BY start_time DESC;
SELECT * FROM sessions WHERE mentee_user_id = $1 ORDER BY start_time DESC;
SELECT * FROM sessions WHERE status = 'in_progress';
```

## Security

### Authorization Checks

Every endpoint validates:
1. User authentication (via guards)
2. Resource ownership (via service methods)
3. State transition permissions (in business logic)

### Data Isolation

Users can only access sessions they participate in:
- Mentees see only their mentee sessions
- Mentors see only their mentor sessions
- No cross-user access possible

## Deployment

### Pre-Deployment
```bash
npm run migration:run    # Create tables
npm run test           # Run all tests
npm run build          # Build TypeScript
```

### Runtime
```bash
npm run start:prod     # Start server
```

### Rollback
```bash
npm run migration:revert  # Revert to previous schema
```

## Monitoring & Logging

### Key Metrics
- Session creation rate
- State transition times
- RBAC violation attempts
- API response times

### Logging Points
- Session creation (from booking)
- State transitions
- Authorization failures
- Database errors

## Documentation

- **This file** - Architecture decisions
- **SESSIONS_IMPLEMENTATION.md** - Complete feature documentation
- **Code comments** - Implementation details
- **Swagger docs** - API reference (/api/docs)

## Code Organization

```
src/
├── bookings/
│   ├── entities/
│   │   └── booking.entity.ts
│   ├── bookings.service.ts
│   ├── bookings.service.spec.ts
│   ├── booking-lifecycle.orchestrator.ts
│   ├── booking-lifecycle.orchestrator.spec.ts
│   └── bookings.module.ts
│
├── sessions/
│   ├── entities/
│   │   └── session.entity.ts
│   ├── dto/
│   │   ├── session-response.dto.ts
│   │   └── session-action.dto.ts
│   ├── sessions.service.ts
│   ├── sessions.service.spec.ts
│   ├── sessions.controller.ts
│   ├── sessions.swagger.ts
│   └── sessions.module.ts
│
├── decorators/auth/
│   ├── current-user.decorator.ts
│   └── current-mentor-profile.decorator.ts
│
├── guards/auth/
│   ├── user.guard.ts
│   └── mentor.guard.ts
│
├── migrations/
│   └── 1769089000000-CreateBookingAndSessionTables.ts
│
└── tests/
    ├── sessions.integration.spec.ts
    └── sessions.e2e-spec.ts
```

## Summary

The Session & Booking system is built on clean architecture principles:

✅ **Single Responsibility** - Each service has one job
✅ **Separation of Concerns** - Clear module boundaries
✅ **No Circular Dependencies** - Orchestrator pattern
✅ **Testable** - Unit, integration, E2E coverage
✅ **Extensible** - Prepared hooks for future features
✅ **Maintainable** - Clear documentation and code organization
✅ **Secure** - Authorization enforcement at all levels
✅ **Performant** - Strategic indexes and efficient queries
