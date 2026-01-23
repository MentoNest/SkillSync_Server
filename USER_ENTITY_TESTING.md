# User Entity Implementation - Quick Testing Guide

## Prerequisites
- API server running on `http://localhost:3000`
- Migration applied: `npm run migration:run`

## Test Endpoints

### 1. Create a User (Mentee)
```bash
curl -X POST http://localhost:3000/auth/admin/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "mentee@example.com",
    "password": "Password123",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

**Expected Response (201 Created):**
```json
{
  "id": "uuid-here",
  "email": "mentee@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "roles": ["mentee"],
  "status": "pending",
  "isActive": true,
  "createdAt": "2026-01-23T...",
  "updatedAt": "2026-01-23T..."
}
```

### 2. Create a User (Mentor with Admin)
```bash
curl -X POST http://localhost:3000/auth/admin/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "AdminPass123",
    "firstName": "Admin",
    "lastName": "User",
    "roles": ["admin", "mentor"],
    "status": "active"
  }'
```

### 3. Create a User (Invalid Email)
```bash
curl -X POST http://localhost:3000/auth/admin/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "invalid-email",
    "password": "Password123"
  }'
```

**Expected Response (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": "Invalid email format"
}
```

### 4. Create a User (Short Password)
```bash
curl -X POST http://localhost:3000/auth/admin/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "short"
  }'
```

**Expected Response (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": ["password must be longer than or equal to 8 characters"]
}
```

### 5. Create Duplicate User
```bash
# First call succeeds
curl -X POST http://localhost:3000/auth/admin/users \
  -H "Content-Type: application/json" \
  -d '{"email": "duplicate@example.com", "password": "Password123"}'

# Second call with same email
curl -X POST http://localhost:3000/auth/admin/users \
  -H "Content-Type: application/json" \
  -d '{"email": "duplicate@example.com", "password": "Password123"}'
```

**Expected Response (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": "User with this email already exists"
}
```

### 6. List Users
```bash
curl -X GET http://localhost:3000/auth/admin/users \
  -H "Content-Type: application/json"
```

**Expected Response (200 OK):**
```json
{
  "users": [
    {
      "id": "uuid-1",
      "email": "mentee@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "roles": ["mentee"],
      "status": "pending",
      "isActive": true,
      "createdAt": "2026-01-23T...",
      "updatedAt": "2026-01-23T..."
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

### 7. List Users with Pagination
```bash
curl -X GET "http://localhost:3000/auth/admin/users?page=2&limit=5" \
  -H "Content-Type: application/json"
```

### 8. Invalid Pagination
```bash
curl -X GET "http://localhost:3000/auth/admin/users?page=0&limit=200" \
  -H "Content-Type: application/json"
```

**Expected Response (400 Bad Request):**
```json
{
  "statusCode": 400,
  "message": ["page must be greater than 0", "limit must be between 1 and 100"]
}
```

## Database Verification

### Check Users Table
```sql
-- Connect to your PostgreSQL database
\c skillsync_db  -- or your database name

-- View users
SELECT id, email, roles, status, created_at FROM users;

-- Check indices
\d users
```

### Expected Schema
```
                                    Table "public.users"
      Column      |           Type           | Collation | Nullable |      Default
------------------+--------------------------+-----------+----------+-------------------
 id               | uuid                     |           | not null | uuid_generate_v4()
 email            | character varying        |           | not null |
 password_hash    | character varying        |           | not null |
 firstName        | character varying        |           |          |
 lastName         | character varying        |           |          |
 avatarUrl        | character varying        |           |          |
 roles            | user_role_enum[]         |           | not null | '{mentee}'::user_role_enum[]
 status           | user_status_enum         |           | not null | 'pending'::user_status_enum
 isActive         | boolean                  |           | not null | true
 emailVerifiedAt  | timestamp without zone   |           |          |
 createdAt        | timestamp without zone   |           | not null | now()
 updatedAt        | timestamp without zone   |           | not null | now()
```

### Verify Indices
```sql
-- Check indices on users table
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'users';
```

Expected indices:
- `IDX_users_email`
- `IDX_users_status`
- `PK_users_id`
- `UQ_users_email`

## Enum Values Verification

```sql
-- Check user_role_enum
SELECT enum_range(null::user_role_enum);

-- Check user_status_enum
SELECT enum_range(null::user_status_enum);
```

## Notes

- Email is case-insensitive (stored and searched in lowercase)
- Passwords are NOT hashed (out of scope for this task)
- Default role is 'mentee'
- Default status is 'pending'
- Users can have multiple roles
- Pagination limit is capped at 100 items
- All timestamps in UTC

## Troubleshooting

### Migration Fails
```bash
# Check migration status
npm run migration:run -- --show

# Revert if needed
npm run migration:revert
```

### Module Not Found Errors
```bash
# Reinstall dependencies
npm install

# Rebuild project
npm run build
```

### Database Connection Issues
- Verify `.env` file has `DATABASE_URL` set correctly
- Ensure PostgreSQL server is running
- Check connection string format: `postgresql://user:password@localhost:5432/database`
