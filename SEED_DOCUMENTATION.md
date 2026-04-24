# Admin Seed Documentation

## Overview

The Admin Seed feature ensures that essential roles and at least one admin user exist on application bootstrap. This seed logic runs automatically before the server starts and is idempotent (safe to run multiple times).

## Features

- **Automatic Execution**: Runs on application boot before server starts
- **Idempotent**: Safe to run multiple times - uses ON CONFLICT checks
- **Atomic Transactions**: Uses database transactions to ensure consistency
- **Environment Variables**: Configurable via environment variables
- **Audit Logging**: Logs all seeding operations
- **Disable Option**: Can be disabled via `DISABLE_SEED=true`
- **Test Environment Aware**: Separate handling for test environments

## Configuration

### Environment Variables

Add these to your `.env.local`, `.env.development`, or `.env` file:

```bash
# Disable seeding (optional, defaults to false)
DISABLE_SEED=false

# Admin wallet address (required for admin user creation)
DEFAULT_ADMIN_WALLET=0x742d35Cc6634C0532925a3b844Bc2e7c6A9A8B0F
```

### Database Configuration

Ensure your database connection is properly configured:

```bash
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=password
DATABASE_NAME=skillsync
```

## Architecture

### Components

1. **AdminSeedService** (`src/database/seeds/admin-seed.service.ts`)
   - Main service handling seed operations
   - Manages admin role and user creation
   - Handles database transactions
   - Provides comprehensive logging

2. **SeedModule** (`src/database/seeds/seed.module.ts`)
   - NestJS module providing AdminSeedService
   - Imports database entities and configuration

### Seed Flow

```
Application Bootstrap
  ↓
[Verify Database Connection]
  ↓
[Load AdminSeedService]
  ↓
[Check DISABLE_SEED]
  ├─ If true → Skip seeding
  └─ If false → Execute seeding
    ↓
[Start Transaction]
  ├─ Create Admin Role (if not exists)
  └─ Create Admin User (if not exists)
    ├─ Get wallet from DEFAULT_ADMIN_WALLET
    ├─ Normalize wallet address
    ├─ Check for existing user
    └─ Create user if missing
  ↓
[Commit Transaction]
  ↓
[Log Results]
  ↓
[Start Server]
```

## Usage

### Automatic Seeding

The seeding happens automatically on application startup:

```bash
npm run start:dev
# Output:
# [Seed] Admin role created; Admin user created
```

### Disable Seeding

To skip seeding for a particular run:

```bash
DISABLE_SEED=true npm run start:dev
# Output:
# [Seed] Seeding disabled
```

### Testing

The seeding can be tested via the test suite:

```bash
npm run test -- admin-seed.service.spec
```

## Database Schema

The seed interacts with the following tables:

### roles table
```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  description VARCHAR(255) NULLABLE,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### users table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "walletAddress" VARCHAR(255) UNIQUE NOT NULL,
  nonce VARCHAR(255) NULLABLE,
  "tokenVersion" INTEGER DEFAULT 1,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### user_roles junction table
```sql
CREATE TABLE user_roles (
  "userId" UUID NOT NULL,
  "roleId" UUID NOT NULL,
  PRIMARY KEY ("userId", "roleId"),
  FOREIGN KEY ("userId") REFERENCES users(id),
  FOREIGN KEY ("roleId") REFERENCES roles(id)
);
```

## Logging

### Success Messages

**Admin role creation**:
```
[AdminSeedService] Created new admin role with ID: {roleId}
```

**Admin role already exists**:
```
[AdminSeedService] Admin role already exists
```

**Admin user creation**:
```
[AdminSeedService] Created new admin user with ID: {userId}
```

**Admin user already exists**:
```
[AdminSeedService] Admin user already exists for wallet: {walletAddress}
```

**Complete seed result**:
```
[Seed] Admin role created; Admin user created
```

### Error Messages

**Missing DEFAULT_ADMIN_WALLET**:
```
[AdminSeedService] DEFAULT_ADMIN_WALLET environment variable not set. Skipping admin user creation.
```

**Database error**:
```
[AdminSeedService] Admin seeding failed: {error message}
```

## Transaction Safety

All seed operations are wrapped in a database transaction to ensure atomicity:

- **Commit**: If all operations succeed
- **Rollback**: If any operation fails

This ensures the database maintains consistency even if the seed partially completes.

## Idempotency Guarantees

The seed uses idempotent operations:

1. **Role Creation**: Checks for existing admin role before creating
2. **User Creation**: Checks for existing user with same wallet before creating
3. **Role Assignment**: Checks before assigning to avoid duplicates

This means the seed can safely run multiple times without creating duplicates.

## Wallet Address Normalization

Wallet addresses are normalized to lowercase before storage to ensure consistent lookups:

```typescript
// Input: 0x742d35Cc6634C0532925a3b844Bc2e7c6A9A8B0F
// Normalized: 0x742d35cc6634c0532925a3b844bc2e7c6a9a8b0f
```

## Admin Role Permissions

The admin role is created with the description: "Administrator role with full system permissions"

Currently, the system doesn't explicitly define permission bits, but the admin role should be checked by role guards on protected routes.

## Migration from Old System

If you're upgrading from a system without seeds:

1. Run migrations first: `npm run migration:run`
2. Start the application: `npm run start:dev`
3. The seed will automatically create the admin role and user

## Troubleshooting

### Seed Not Running

**Problem**: Seeding isn't executing
- **Solution**: Check that `DISABLE_SEED` is not set to `true`
- **Solution**: Verify database connection is working

### Admin User Not Created

**Problem**: Admin role exists but admin user wasn't created
- **Solution**: Check that `DEFAULT_ADMIN_WALLET` is set in environment
- **Solution**: Verify wallet address format (0x...)

### Duplicate Admin Errors

**Problem**: Getting errors about duplicate admin users
- **Solution**: This shouldn't happen as the seed is idempotent
- **Solution**: Check database for corrupted data

### Database Connection Timeout

**Problem**: Seed fails with database connection error
- **Solution**: Verify database is running and accessible
- **Solution**: Check `DATABASE_HOST`, `DATABASE_PORT` configuration
- **Solution**: Check network connectivity

## Advanced: Custom Seed Data

To extend the seeding logic with custom data:

1. Add a new seed service in `src/database/seeds/`
2. Import it in `SeedModule`
3. Call it from `main.ts` after `AdminSeedService`

Example:

```typescript
// src/database/seeds/custom-seed.service.ts
@Injectable()
export class CustomSeedService {
  async seed(): Promise<SeedResult> {
    // Your custom seeding logic
  }
}
```

```typescript
// In main.ts
const customSeedService = app.get(CustomSeedService);
await customSeedService.seed();
```

## Performance Considerations

- Seed runs before server starts, adding ~100-500ms to startup time
- Database queries are optimized with indexes
- Transaction overhead is minimal for this operation

## Security Notes

- Wallet addresses are stored in lowercase for consistency
- Admin user wallet should be carefully configured
- Change `DEFAULT_ADMIN_WALLET` in production to your admin wallet
- Use environment variables, never hardcode wallet addresses

## Testing

The seed service is fully tested with comprehensive test coverage:

```bash
npm run test -- admin-seed.service.spec
```

Test cases cover:
- Seeding disabled scenario
- Successful role and user creation
- Existing role handling
- Existing user handling
- Missing wallet configuration
- Transaction rollback on error
