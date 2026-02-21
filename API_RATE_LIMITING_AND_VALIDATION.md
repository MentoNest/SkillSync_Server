# API Rate Limiting & Validation Implementation

## Overview

This document describes the implementation of Redis-based API rate limiting and global validation pipes for the SkillSync_Server project.

## Features Implemented

### 1. Redis-Based API Rate Limiting

#### Global Rate Limiting
- **Purpose**: Prevent API abuse and ensure fair usage
- **Technology**: Redis for distributed rate limiting
- **Configuration**: Environment-based configuration via `.env`

#### Rate Limiting Strategies
- **Global**: Per-IP rate limiting applied to all requests
- **Per-Wallet**: Rate limiting based on wallet addresses
- **Per-User**: Rate limiting based on authenticated users
- **Predefined Levels**: Strict, Normal, Relaxed configurations

#### Key Components

**RateLimitService** (`src/common/cache/rate-limit.service.ts`)
- Enhanced service with multiple rate limiting strategies
- Supports configurable windows and request limits
- Fail-open design (allows requests if Redis unavailable)
- Returns detailed rate limit metadata

**RateLimitGuard** (`src/common/guards/rate-limit.guard.ts`)
- Route-level protection using NestJS guards
- Customizable per-route configurations
- Automatic header injection (X-RateLimit-*)
- Skip conditions for exempted routes

**Rate Limit Decorators** (`src/common/decorators/rate-limit.decorator.ts`)
- `@RateLimit()` - Apply custom rate limiting to routes
- `@SkipRateLimit()` - Exempt routes from rate limiting
- Predefined configurations: `RateLimits.STRICT`, `RateLimits.NORMAL`, etc.

#### Configuration

**Environment Variables** (added to `.env.example`):
```env
# Rate Limiting Configuration
RATE_LIMIT_ENABLED=true

# Global rate limiting (applies to all requests)
RATE_LIMIT_GLOBAL_WINDOW_MS=60000
RATE_LIMIT_GLOBAL_MAX=100

# Per-IP rate limiting
RATE_LIMIT_PER_IP_WINDOW_MS=60000
RATE_LIMIT_PER_IP_MAX=100

# Per-wallet rate limiting
RATE_LIMIT_PER_WALLET_WINDOW_MS=60000
RATE_LIMIT_PER_WALLET_MAX=50

# Per-user rate limiting
RATE_LIMIT_PER_USER_WINDOW_MS=60000
RATE_LIMIT_PER_USER_MAX=200

# Predefined rate limits
RATE_LIMIT_STRICT_MAX=10
RATE_LIMIT_RELAXED_MAX=1000

# Paths to exempt from rate limiting (comma-separated)
RATE_LIMIT_EXEMPT_PATHS=/health,/health/redis,/metrics
```

### 2. Global Validation Pipes

#### Purpose
- Ensure all request DTOs are validated using `class-validator`
- Block unexpected fields with `forbidNonWhitelisted` option
- Provide consistent error responses

#### Implementation

**Global ValidationPipe** (`src/main.ts`)
```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,           // Strip non-whitelisted properties
    forbidNonWhitelisted: true, // Throw error for non-whitelisted properties
    transform: true,           // Automatically transform payloads to DTO instances
    transformOptions: {
      enableImplicitConversion: true,
    },
  }),
);
```

**Validation Exception Filter** (`src/common/filters/validation-exception.filter.ts`)
- Formats validation errors consistently
- Provides detailed error information
- Maintains API response structure

#### Validated DTOs

**Auth Module** (`src/modules/auth/dto/`)
- `CreateAuthDto`: Wallet address, signature, nonce validation
- `UpdateAuthDto`: Inherits from CreateAuthDto with PartialType

**User Module** (`src/modules/user/dto/`)
- `CreateUserDto`: Email, name, role, wallet address, profile picture, bio validation
- `UpdateUserDto`: Inherits from CreateUserDto with PartialType

#### Validation Rules

**Auth DTO Validation:**
- Wallet address: Ethereum address format validation
- Signature: String, exactly 132 characters (65 bytes hex)
- Nonce: Optional string
- Metadata: Optional record

**User DTO Validation:**
- Email: Valid email format
- Name: String, 2-100 characters
- Role: Enum (mentee, mentor, admin)
- Wallet address: Optional string
- Profile picture: Valid URL format
- Bio: Optional string, max 500 characters

## Response Headers

### Rate Limit Headers
All rate-limited responses include:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when limit resets
- `X-RateLimit-Current`: Current request count
- `Retry-After`: Seconds until next allowed request (429 responses)

### Error Responses

**429 Too Many Requests:**
```json
{
  "statusCode": 429,
  "message": "Too Many Requests",
  "error": "Rate limit exceeded",
  "retryAfter": 45
}
```

**400 Validation Error:**
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "property": "email",
      "value": "invalid-email",
      "constraint": "isEmail",
      "message": "Invalid email format"
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users"
}
```

## Exempted Routes

The following routes are exempt from rate limiting:
- `/health`
- `/health/redis`
- `/metrics` (configurable)

## Testing

### Rate Limiting Test
```bash
# Test rate limiting (should return 429 after limit exceeded)
curl -X POST http://localhost:3000/auth/nonce
# Repeat 11+ times within 1 minute to trigger rate limit
```

### Validation Test
```bash
# Test validation (should return 400 for invalid data)
curl -X POST http://localhost:3000/auth \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "invalid", "signature": "short"}'
```

## Files Modified/Added

### New Files Created:
- `src/common/cache/rate-limit.service.ts` - Enhanced rate limiting service
- `src/common/guards/rate-limit.guard.ts` - Rate limiting guard
- `src/common/decorators/rate-limit.decorator.ts` - Rate limit decorators
- `src/common/middleware/rate-limit.middleware.ts` - Rate limiting middleware
- `src/common/filters/validation-exception.filter.ts` - Validation error filter
- `src/common/cache/cache.module.ts` - Cache module
- `src/modules/health/health.controller.ts` - Health check controller
- `src/modules/health/health.module.ts` - Health check module

### Modified Files:
- `src/main.ts` - Added global validation pipe and exception filters
- `src/app.module.ts` - Added CacheModule and HealthModule
- `src/config/config.service.ts` - Added rate limiting configuration
- `src/config/config.module.ts` - Added rate limiting validation schema
- `src/modules/auth/dto/create-auth.dto.ts` - Added validation decorators
- `src/modules/user/dto/create-user.dto.ts` - Added validation decorators
- `.env.example` - Added rate limiting configuration variables

### Dependencies Added:
- `class-validator` - For DTO validation
- `class-transformer` - For payload transformation

## Usage Examples

### Applying Rate Limits to Routes
```typescript
@Controller('api')
export class ApiController {
  @Get('sensitive-data')
  @RateLimit(RateLimits.STRICT) // 10 requests per minute
  getSensitiveData() {
    return { data: 'sensitive' };
  }

  @Post('user-data')
  @RateLimit(RateLimits.USER) // 200 requests per minute per user
  createUserData(@Body() dto: CreateUserDataDto) {
    return { success: true };
  }

  @Get('public-info')
  @SkipRateLimit() // Exempt from rate limiting
  getPublicInfo() {
    return { info: 'public' };
  }
}
```

### DTO Validation Example
```typescript
export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @Length(2, 100)
  name: string;

  @IsOptional()
  @IsUrl()
  profilePicture?: string;
}
```

## Configuration Best Practices

1. **Development**: Use higher limits for easier testing
2. **Production**: Use stricter limits to prevent abuse
3. **Monitoring**: Log rate limit violations for security analysis
4. **Scaling**: Redis allows horizontal scaling of rate limiting

## Security Considerations

- Rate limiting helps prevent DDoS attacks
- Validation prevents injection attacks and data corruption
- Fail-open design ensures service availability during Redis issues
- Exempted routes should be minimal and security-reviewed

## Future Enhancements

- Add rate limit metrics and monitoring
- Implement adaptive rate limiting based on traffic patterns
- Add IP whitelisting for trusted sources
- Integrate with logging systems for violation tracking