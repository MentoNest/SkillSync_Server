# Profile Creation Endpoint Implementation

## Overview
The profile creation endpoint allows authenticated users to create either a mentor or mentee profile after registration. Users can have both profile types simultaneously.

## Implementation Details

### 1. **Endpoint**
- **Route**: `POST /users/profile`
- **HTTP Status**: 201 Created
- **Authentication**: Required (JWT via `JwtAuthGuard`)
- **Authorization**: All authenticated users

### 2. **Request Body Structure**

#### Mentor Profile
```json
{
  "profileType": "mentor",
  "bio": "string (required)",
  "expertise": ["string"] (optional, max 20 unique items),
  "yearsOfExperience": number (required, >= 0),
  "preferredMentoringStyle": ["string"] (optional, unique items),
  "availabilityHoursPerWeek": number (optional, >= 0),
  "availabilityDetails": "string (optional)"
}
```

#### Mentee Profile
```json
{
  "profileType": "mentee",
  "learningGoals": "string (required)",
  "areasOfInterest": ["string"] (optional, unique items),
  "currentSkillLevel": "string (required)",
  "preferredMentoringStyle": ["string"] (optional, unique items),
  "timeCommitmentHoursPerWeek": number (required, >= 0),
  "professionalBackground": "string (optional)",
  "jobTitle": "string (optional)",
  "industry": "string (optional)",
  "portfolioLinks": ["string"] (optional, unique items)
}
```

### 3. **Response Body**

Both mentor and mentee profiles return the same structure with profile-specific fields:

```json
{
  "id": "uuid",
  "bio": "string (mentor only)",
  "expertise": ["string"] (mentor only),
  "yearsOfExperience": number (mentor only),
  "learningGoals": "string (mentee only)",
  "areasOfInterest": ["string"] (mentee only),
  "currentSkillLevel": "string (mentee only)",
  "createdAt": "ISO 8601 timestamp",
  "updatedAt": "ISO 8601 timestamp"
}
```

### 4. **Validation Rules**

#### Input Validation (Class-Validator DTOs)
- **profileType**: Must be enum value ('mentor' | 'mentee')
- **bio** (mentor): Required string, not empty
- **expertise** (mentor): Optional array of strings, max 20 items, must be unique
- **yearsOfExperience** (mentor): Required integer, minimum value 0
- **learningGoals** (mentee): Required string, not empty
- **currentSkillLevel** (mentee): Required string, not empty
- **timeCommitmentHoursPerWeek** (mentee): Required integer, minimum value 0
- **Array fields**: All array fields validate `ArrayUnique()` and `ArrayMaxSize()` where applicable

#### Business Logic Validation
- User must be authenticated (JWT token required)
- User must exist in database
- User cannot create duplicate profile of same type (409 Conflict)
- User can create both mentor and mentee profiles

### 5. **Error Handling**

| HTTP Status | Condition | Exception |
|------------|-----------|-----------|
| 400 | Invalid input data or missing required fields | `BadRequestException` |
| 401 | Missing or invalid JWT token | `UnauthorizedException` |
| 404 | User not found | `NotFoundException` |
| 409 | Profile of that type already exists | `ConflictException` |
| 500 | Server error | `InternalServerErrorException` |

### 6. **Database Operations**

#### Entities Modified
1. **MentorProfile** (mentor_profiles table)
   - Created with user relationship
   - Indexed by user_id for fast lookups

2. **MenteeProfile** (mentee_profiles table)
   - Created with user relationship
   - Indexed by user_id for fast lookups

3. **User** (users table)
   - One-to-One relationship with MentorProfile
   - One-to-One relationship with MenteeProfile
   - Roles updated via `roles` Many-to-Many relationship

### 7. **Role Management**

- **Automatic Role Assignment**: When a profile is created, the corresponding role is automatically assigned to the user
- **Mentor Role**: Assigned when mentor profile is created
- **Mentee Role**: Already assigned during registration; re-assigning does not cause issues
- **Token Version Increment**: User's `tokenVersion` is incremented when roles change, invalidating existing tokens

### 8. **Audit Logging**

All profile creation events are logged with:
- **Event Type**: `PROFILE_CREATED`
- **User ID**: ID of user who created the profile
- **Request Metadata**:
  - IP Address
  - User Agent
  - Device Fingerprint (if available)
- **Details**:
  - Profile type (mentor/mentee)
  - Profile ID

### 9. **Implementation Files**

#### DTOs
- **[src/users/dto/create-profile.dto.ts](src/users/dto/create-profile.dto.ts)**: Comprehensive validation with conditional validators

#### Controllers
- **[src/users/users.controller.ts](src/users/users.controller.ts)**: Endpoint handler with JWT protection

#### Services
- **[src/users/users.service.ts](src/users/users.service.ts)**: 
  - `createProfile()`: Main business logic
  - `assignRole()`: Role assignment with token version increment
  - `revokeRole()`: Role removal

#### Entities
- **[src/users/entities/mentor-profile.entity.ts](src/users/entities/mentor-profile.entity.ts)**
- **[src/users/entities/mentee-profile.entity.ts](src/users/entities/mentee-profile.entity.ts)**
- **[src/users/entities/user.entity.ts](src/users/entities/user.entity.ts)**

#### Tests
- **[src/users/users.service.spec.ts](src/users/users.service.spec.ts)**: Unit tests for service methods
- **[src/users/users.controller.spec.ts](src/users/users.controller.spec.ts)**: Controller spec tests
- **[test/user-profile.e2e-spec.ts](test/user-profile.e2e-spec.ts)**: End-to-end integration tests

#### Module Configuration
- **[src/users/users.module.ts](src/users/users.module.ts)**: Imports TypeORM entities and AuthModule

### 10. **Test Coverage**

#### Unit Tests (Service)
- ✅ Validates mentor profile required fields
- ✅ Validates mentee profile required fields
- ✅ Throws ConflictException when mentor profile already exists
- ✅ Creates mentor profile and assigns mentor role
- ✅ Creates mentee profile and keeps existing mentee role
- ✅ Throws NotFoundException when user doesn't exist

#### Controller Tests
- ✅ getMe: Returns current user profile
- ✅ createProfile: Creates mentor profile with audit data
- ✅ createProfile: Creates mentee profile with audit data
- ✅ createProfile: Throws ConflictException on duplicate
- ✅ assignRole: Assigns role to user
- ✅ revokeRole: Revokes role from user

#### Integration Tests (E2E)
- ✅ Requires authentication (401 without token)
- ✅ Validates required mentor fields
- ✅ Validates required mentee fields
- ✅ Validates expertise array uniqueness
- ✅ Returns 409 when profile already exists
- ✅ Creates mentor profile with 201 status
- ✅ Creates mentee profile with 201 status
- ✅ Allows user to have both profiles
- ✅ Assigns mentor role correctly
- ✅ Assigns mentee role correctly
- ✅ Validates yearsOfExperience non-negative
- ✅ Validates expertise array max size

### 11. **Acceptance Criteria Compliance**

| Criterion | Implementation | Status |
|-----------|----------------|--------|
| Protected endpoint requiring JWT | `@UseGuards(JwtAuthGuard)` in controller | ✅ |
| Request body includes profileType | `profileType: AuthRole` in DTO | ✅ |
| Profile-specific fields validated | Class-validator decorators with `ValidateIf` | ✅ |
| Error 409 when profile exists | `ConflictException` thrown in service | ✅ |
| User role updated automatically | `assignRole()` called in `createProfile()` | ✅ |
| Response returns full profile with timestamps | Entity includes `createdAt` and `updatedAt` | ✅ |
| Audit log entry created | `AuditLogService.logEvent()` called | ✅ |
| Unit tests for validation | `users.service.spec.ts` covers validation | ✅ |
| Unit tests for error cases | Tests for ConflictException, NotFoundException | ✅ |
| Unit tests for success scenario | Tests for both mentor and mentee creation | ✅ |

### 12. **Usage Example**

```bash
# Create Mentor Profile
curl -X POST http://localhost:3000/users/profile \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "profileType": "mentor",
    "bio": "I am an experienced full-stack developer",
    "expertise": ["typescript", "react", "node.js"],
    "yearsOfExperience": 7,
    "availabilityHoursPerWeek": 5
  }'

# Create Mentee Profile
curl -X POST http://localhost:3000/users/profile \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "profileType": "mentee",
    "learningGoals": "Master full-stack web development",
    "areasOfInterest": ["react", "node.js"],
    "currentSkillLevel": "intermediate",
    "timeCommitmentHoursPerWeek": 10
  }'
```

### 13. **Security Considerations**

1. **Authentication**: All requests require valid JWT token
2. **Authorization**: Profile creation only available to authenticated users
3. **Validation**: All input is validated using class-validator
4. **Audit Trail**: All profile creations are logged for accountability
5. **Role-Based Access**: Roles are properly managed and validated
6. **Token Refresh**: Token version increments on role change to refresh sessions

### 14. **Performance Considerations**

1. **Database Queries**:
   - User lookup by ID: Indexed query
   - Profile existence check: Indexed by user_id
   - Role lookup: Indexed query
   - Role assignment: Batched via ManyToMany relationship

2. **Indexes**:
   - `mentor_profiles(user_id)`: For profile existence checks
   - `mentee_profiles(user_id)`: For profile existence checks
   - `users.id`: Primary key
   - `user_roles(user_id)`: For role lookups

## Running Tests

### Unit Tests
```bash
npm test -- users.service.spec.ts
npm test -- users.controller.spec.ts
```

### Integration Tests
```bash
npm run test:e2e -- user-profile.e2e-spec.ts
```

### All Tests
```bash
npm test
```

## Future Enhancements

1. **Profile Update Endpoint**: PATCH /users/profile/:profileType to update existing profiles
2. **Profile Retrieval**: GET /users/profile/:profileType to fetch specific profile
3. **Profile Deletion**: DELETE /users/profile/:profileType to remove profile
4. **Profile Search**: GET /users/profiles/mentors to search mentors by criteria
5. **Role Hierarchy**: Support for role inheritance and permissions
6. **Profile Completion**: Track profile completion percentage
