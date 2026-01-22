# Skills Taxonomy & Mentor Skill Linking - Implementation

This implementation provides a complete system for managing skills and linking them to mentor profiles with proficiency levels and experience metadata.

## Overview

The system includes:
- **Skill Taxonomy**: Canonical skills with unique names and slugs
- **Mentor Profiles**: Profiles linked to users that can declare skills
- **Mentor Skills**: Junction table linking mentors to skills with proficiency metadata
- **RESTful API**: Full CRUD operations for skills and mentor-skill associations
- **Skill-based Discovery**: Filter mentors by required skills

## Database Schema

### Entities

#### 1. `skills` table
- `id` (uuid, PK)
- `name` (varchar, unique)
- `slug` (varchar, unique, indexed)
- `category` (varchar, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### 2. `mentor_profiles` table
- `id` (uuid, PK)
- `user_id` (uuid, FK to users, unique)
- `bio` (text, nullable)
- `title` (varchar, nullable)
- `years_of_experience` (integer)
- `is_available` (boolean)
- `created_at` (timestamp)
- `updated_at` (timestamp)

#### 3. `mentor_skills` table (junction)
- `id` (uuid, PK)
- `mentor_profile_id` (uuid, FK to mentor_profiles)
- `skill_id` (uuid, FK to skills)
- `level` (enum: beginner/intermediate/expert)
- `years_experience` (integer, 0-50)
- Unique constraint: (mentor_profile_id, skill_id)
- Indices on: mentor_profile_id, skill_id

## API Endpoints

### Skills Management

#### `POST /skills`
Create a new skill
```json
{
  "name": "NestJS",
  "category": "backend"
}
```

#### `GET /skills`
Get all skills

#### `GET /skills/:id`
Get skill by ID

#### `GET /skills/slug/:slug`
Get skill by slug

#### `DELETE /skills/:id`
Delete a skill

### Mentor Skills Management

#### `POST /mentor-skills/attach`
Attach a skill to current mentor profile
```json
{
  "skillId": "uuid",
  "level": "intermediate",
  "yearsExperience": 3
}
```

#### `PUT /mentor-skills/:skillId`
Update mentor skill proficiency
```json
{
  "level": "expert",
  "yearsExperience": 5
}
```

#### `DELETE /mentor-skills/:skillId`
Detach a skill from mentor profile

#### `GET /mentor-skills/my-skills`
Get all skills for current mentor

### Mentor Discovery

#### `GET /mentors?skills=<skillId1>,<skillId2>`
Filter mentors by required skills (comma-separated skill IDs)
Returns mentors that have ALL specified skills

## Features

### Skill Taxonomy
- Unique, canonical skills with URL-friendly slugs
- Optional categorization (backend, frontend, devops, etc.)
- Automatic slug generation from name

### Mentor Skill Linking
- Many-to-many relationship between mentors and skills
- Proficiency levels: beginner, intermediate, expert
- Years of experience tracking (0-50 range)
- Unique constraint prevents duplicate skill assignments

### Ownership & Security
- Mentors can only modify their own skills
- JWT-based authentication (req.user.sub)
- Proper error handling with appropriate HTTP status codes

### Performance
- Database indices on foreign keys and lookup fields
- Efficient filtering using SQL joins and aggregations
- Query builder for complex mentor discovery queries

## Running Migrations

1. Ensure database is running:
```bash
docker-compose up -d
```

2. Run migrations:
```bash
npm run migration:run
```

Migrations will be applied in order:
1. `CreateMentorProfilesTable` - Creates mentor_profiles table
2. `CreateSkillsTable` - Creates skills table
3. `CreateMentorSkillsTable` - Creates mentor_skills junction table

## Testing

### Unit Tests
```bash
npm test skill.service.spec.ts
npm test mentor-skill.service.spec.ts
```

### Integration Tests
```bash
npm run test:e2e skills.e2e-spec.ts
```

## Swagger Documentation

API documentation is available at:
```
http://localhost:3000/api/docs
```

The Swagger UI includes:
- Full endpoint documentation
- Request/response schemas
- Try-it-out functionality
- Authentication support

## Example Usage

### 1. Create Skills
```bash
curl -X POST http://localhost:3000/skills \
  -H "Content-Type: application/json" \
  -d '{"name": "TypeScript", "category": "programming-language"}'

curl -X POST http://localhost:3000/skills \
  -H "Content-Type: application/json" \
  -d '{"name": "AWS", "category": "cloud"}'
```

### 2. Attach Skills to Mentor
```bash
curl -X POST http://localhost:3000/mentor-skills/attach \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "skillId": "<skill-uuid>",
    "level": "intermediate",
    "yearsExperience": 3
  }'
```

### 3. Find Mentors by Skills
```bash
curl http://localhost:3000/mentors?skills=<skill1-uuid>,<skill2-uuid>
```

## Validation

All DTOs include validation:
- UUIDs are validated for skill and mentor IDs
- Skill levels must be one of: beginner, intermediate, expert
- Years of experience must be between 0 and 50
- Skill names must be unique

## Error Handling

The API returns appropriate HTTP status codes:
- `200` - Success
- `201` - Created
- `204` - No Content (successful deletion)
- `404` - Not Found
- `409` - Conflict (duplicate skill)
- `422` - Validation Error

## Future Enhancements

Potential improvements:
- Skill endorsements from mentees
- Skill verification/certification
- Skill recommendations based on mentor background
- Skill popularity tracking
- Advanced search with skill categories
- Skill hierarchy/relationships

## Files Created

### Entities
- `apps/api/src/entities/skill.entity.ts`
- `apps/api/src/entities/mentor-profile.entity.ts`
- `apps/api/src/entities/mentor-skill.entity.ts`

### Migrations
- `apps/api/src/migrations/1769059635000-CreateMentorProfilesTable.ts`
- `apps/api/src/migrations/1769059636000-CreateSkillsTable.ts`
- `apps/api/src/migrations/1769059637000-CreateMentorSkillsTable.ts`

### DTOs
- `apps/api/src/dtos/skill.dto.ts`
- `apps/api/src/dtos/mentor-skill.dto.ts`

### Services
- `apps/api/src/services/skill.service.ts`
- `apps/api/src/services/mentor-skill.service.ts`

### Controllers
- `apps/api/src/controllers/skill.controller.ts`
- `apps/api/src/controllers/mentor-skill.controller.ts`

### Modules
- `apps/api/src/modules/skill.module.ts`

### Tests
- `apps/api/src/services/skill.service.spec.ts`
- `apps/api/src/services/mentor-skill.service.spec.ts`
- `apps/api/src/tests/skills.e2e-spec.ts`
