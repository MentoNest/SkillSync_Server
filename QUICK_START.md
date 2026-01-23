# Session Lifecycle - Quick Start Guide

## For Developers

### Understanding the System

Sessions are auto-created mentorship meetings tied to bookings:

```
Mentee Books Session → Mentor Accepts → Session Created (SCHEDULED)
    ↓
Both can see & join
    ↓
Mentor marks complete → Session ends (COMPLETED)
    ↓
Mentee can now leave review (future)
```

### Key Files

**Must Read First:**
1. [SESSIONS_IMPLEMENTATION.md](./SESSIONS_IMPLEMENTATION.md) - Feature overview
2. [ARCHITECTURE.md](./ARCHITECTURE.md) - Design decisions

**Code (In Order):**
1. `src/bookings/entities/booking.entity.ts` - Data model
2. `src/sessions/entities/session.entity.ts` - Data model
3. `src/bookings/bookings.service.ts` - Booking state
4. `src/sessions/sessions.service.ts` - Session state
5. `src/bookings/booking-lifecycle.orchestrator.ts` - Coordination
6. `src/sessions/sessions.controller.ts` - API

### Common Tasks

#### 1. Add a New Session Endpoint

Location: `src/sessions/sessions.controller.ts`

```typescript
@Patch(':id/my-new-action')
@UseGuards(MentorGuard)  // or add appropriate guard
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'My description' })
@ApiResponse({ status: 200, type: SessionResponseDto })
async myNewAction(
  @Param('id') id: string,
  @CurrentMentorProfile() mentorProfileId: string,
): Promise<SessionResponseDto> {
  return this.sessionsService.myNewAction(id, mentorProfileId);
}
```

Then implement in `sessions.service.ts`:

```typescript
async myNewAction(id: string, mentorProfileId: string): Promise<SessionResponseDto> {
  const session = await this.sessionRepository.findOne({ where: { id } });
  
  // Validate ownership, state, etc.
  
  return this.toResponseDto(session);
}
```

#### 2. Add a Completion Side-Effect

Location: `src/sessions/sessions.service.ts`

```typescript
private async onSessionCompleted(session: Session): Promise<void> {
  // Add your logic here (reviews, notifications, etc.)
  
  // Example:
  // await this.reviewsService.unlockReviewEligibility(session.id);
  // await this.notificationsService.notifySessionCompleted(session.menteeUserId);
}
```

#### 3. Run Tests

```bash
# Run all tests
npm run test

# Run specific test file
npm run test -- sessions.service.spec

# Run with coverage
npm run test:cov
```

#### 4. View API Docs

After starting server:
```bash
npm run start:dev
```

Visit: http://localhost:3000/api/docs

Search for "Sessions" tag to see all endpoints.

### Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| Session not found | Invalid ID | Check session exists in DB |
| Forbidden | Wrong user | Verify x-user-id or x-mentor-profile-id header |
| Bad Request | Wrong state | Session must be SCHEDULED to start, IN_PROGRESS to complete |
| Conflict | Duplicate session | Check sessions.booking_id is unique |

### Database Queries (Debugging)

```sql
-- View all sessions
SELECT * FROM sessions ORDER BY created_at DESC;

-- View session for booking
SELECT * FROM sessions WHERE booking_id = '{bookingId}';

-- View mentor's sessions
SELECT * FROM sessions 
WHERE mentor_profile_id = '{mentorProfileId}' 
ORDER BY start_time DESC;

-- View mentee's sessions
SELECT * FROM sessions 
WHERE mentee_user_id = '{menteeUserId}' 
ORDER BY start_time DESC;

-- Check session status distribution
SELECT status, COUNT(*) FROM sessions GROUP BY status;
```

### Module Dependencies

```
SessionsModule (independent)
    ↑
    │ (imports)
    │
BookingsModule
```

If adding new features:
1. Add to SessionsModule if it's session-specific
2. Add to BookingsModule if it's booking-specific
3. Use BookingLifecycleOrchestrator for coordination

### Adding Tests

1. **Unit Test** (test one service):
   - Location: `*.service.spec.ts`
   - Use mocked repositories
   - Test all business logic paths

2. **Integration Test** (test workflow):
   - Location: `*.integration.spec.ts`
   - Use real-like mock data
   - Test cross-service interactions

3. **E2E Test** (test API):
   - Location: `*.e2e-spec.ts`
   - Test HTTP contracts
   - Test authorization

Example:
```typescript
describe('MyNewFeature', () => {
  it('should do X when Y happens', async () => {
    // Arrange
    const data = setupTestData();
    
    // Act
    const result = await service.myFeature(data);
    
    // Assert
    expect(result).toBeDefined();
    expect(result.status).toBe(expected);
  });
});
```

### Environment Variables

No new variables needed. Sessions use existing auth headers:
- `x-user-id` (for mentees)
- `x-mentor-profile-id` (for mentors)

### Performance Tips

**For Large Datasets:**
```typescript
// Bad (N+1 query)
const sessions = await repository.find();
sessions.forEach(s => console.log(s.booking.id));

// Good (single query with relations)
const sessions = await repository.find({
  relations: ['booking']
});
```

**For Filtering:**
```typescript
// Always use indexed fields where possible
// Good candidates: booking_id, mentor_profile_id, mentee_user_id, status
```

### Debugging

**Enable SQL Logging:**
```typescript
// In data-source.ts
logging: true  // Set to see all queries
```

**Add Console Logs:**
```typescript
console.log('[SESSION] Creating session for booking', bookingId);
console.log('[SESSION] State transition:', { from, to });
```

**Check Request Headers:**
```typescript
console.log('Headers:', request.headers);
```

### Code Style

Follow existing patterns:

```typescript
// ✅ Good: Consistent with codebase
async findOne(id: string, userId: string): Promise<ResponseDto> {
  const entity = await this.repository.findOne({ where: { id } });
  if (!entity) throw new NotFoundException();
  return this.toResponseDto(entity);
}

// ❌ Bad: Different style
function find(id) {
  let entity = this.repo.findOneBy({id});
  if (!entity) throw "not found";
  return entity;
}
```

### Documentation Requirements

For any new code:
- [ ] JSDoc comments on public methods
- [ ] Inline comments for complex logic
- [ ] Type annotations on all functions
- [ ] Update relevant markdown docs
- [ ] Update Swagger decorators

Example:
```typescript
/**
 * Validate session state transition
 * 
 * @param from Current status
 * @param to Desired status
 * @throws BadRequestException if transition not allowed
 * @returns true if transition is valid
 */
private validateTransition(from: SessionStatus, to: SessionStatus): void {
  // Implementation...
}
```

### Deployment

**Before Deploying:**
```bash
# 1. Run all tests
npm run test
npm run test:e2e

# 2. Build
npm run build

# 3. Check for errors
npm run lint
```

**During Deployment:**
```bash
# 1. Run migrations
npm run migration:run

# 2. Start server
npm run start:prod
```

**If Something Goes Wrong:**
```bash
# Revert database
npm run migration:revert

# Check logs
tail -f logs/app.log
```

### Getting Help

**Documentation:**
- SESSIONS_IMPLEMENTATION.md (feature overview)
- ARCHITECTURE.md (design decisions)
- IMPLEMENTATION_CHECKLIST.md (requirements verification)
- Code comments (implementation details)

**Code Examples:**
- See `*.service.spec.ts` for usage patterns
- See `*.e2e-spec.ts` for API contract
- See `*.integration.spec.ts` for workflows

**Ask Questions:**
- Check inline comments first
- Read test cases for examples
- Review existing similar code
- Check TypeScript types for contracts

---

**Happy Coding! 🚀**

The Session system is built on solid foundations - follow the patterns and you'll fit right in.
