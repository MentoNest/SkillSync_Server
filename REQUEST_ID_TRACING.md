# Request ID Tracing Documentation

## Overview

SkillSync Server implements comprehensive request ID generation and propagation for distributed tracing. Every incoming HTTP request receives a unique UUID v4 identifier that flows through the entire request lifecycle, enabling correlation of logs, database queries, and error tracking.

## Features

✅ **Unique Request ID per Request** - UUID v4 generated for each incoming request  
✅ **Distributed Tracing Support** - Accepts `X-Request-Id` header from upstream services  
✅ **Logger Context Integration** - All logs include request ID automatically  
✅ **Response Headers** - `X-Request-Id` included in all HTTP responses  
✅ **Error Response Tracking** - Error responses include `requestId` field  
✅ **Database Query Comments** - SQL queries include request ID in comments  
✅ **Async Context Propagation** - Request ID flows through async operations  
✅ **Minimal Performance Impact** - < 0.1ms overhead per request  

## Architecture

### Components

1. **RequestContextService** - Core service using AsyncLocalStorage for request-scoped context
2. **RequestLoggerMiddleware** - Generates/propagates request ID at request entry point
3. **DatabaseRequestSubscriber** - Adds request ID comments to database queries
4. **GlobalExceptionFilter** - Includes request ID in error logging
5. **Decorators** - `@RequestId()` and `@RequestContext()` for easy access

### Request Flow

```
Client Request
    ↓
[RequestLoggerMiddleware] - Generate/extract request ID
    ↓ (sets X-Request-Id header)
[AsyncLocalStorage Context] - Store request ID in context
    ↓
[Application Logic] - Access via RequestContextService
    ↓
[Database Queries] - Commented with /* request_id: xxx */
    ↓
[Response] - X-Request-Id header included
    ↓
[Logging] - All logs include requestId field
```

## Usage

### Automatic (Default Behavior)

Request ID tracing works automatically without any code changes. Every request gets a unique ID that appears in:

- **Response Headers**: `X-Request-Id: 550e8400-e29b-41d4-a716-446655440000`
- **Logs**: `{"requestId":"550e8400-...","method":"GET","path":"/api/users"}`
- **Error Responses**: `{"requestId":"550e8400-...","error":"Not Found"}`
- **Database Queries**: `/* request_id: 550e8400-... */ SELECT * FROM users`

### Manual Access in Controllers

```typescript
import { Controller, Get } from '@nestjs/common';
import { RequestId, RequestContext } from '@common/decorators/request-context.decorator';
import { RequestContextService } from '@common/services/request-context.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly requestContextService: RequestContextService,
  ) {}

  @Get()
  findAll(@RequestId() requestId: string) {
    // requestId is available here
    console.log(`Fetching users for request: ${requestId}`);
    return this.usersService.findAll();
  }

  @Get('context')
  getContext(@RequestContext() context: RequestContextData) {
    return {
      requestId: context.requestId,
      timestamp: context.timestamp,
    };
  }

  @Get('service')
  useService() {
    // Access request ID via service anywhere in the call stack
    const requestId = this.requestContextService.getRequestId();
    return { requestId };
  }
}
```

### Access in Services

```typescript
import { Injectable } from '@nestjs/common';
import { RequestContextService } from '@common/services/request-context.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly requestContextService: RequestContextService,
  ) {}

  async findAll() {
    const requestId = this.requestContextService.getRequestId();
    
    // Log with request ID for tracing
    this.logger.log(`Fetching all users [${requestId}]`);
    
    // Database queries automatically include request ID in comments
    return this.userRepository.find();
  }
}
```

## Configuration

### Environment Variables

```env
# Enable request ID generation and propagation (default: true)
ENABLE_REQUEST_TRACING=true

# Include request ID in database query comments (default: true)
ENABLE_DB_QUERY_TRACING=true
```

### Distributed Tracing

If your application is behind an API gateway or load balancer that generates request IDs, simply pass the `X-Request-Id` header:

```bash
curl -H "X-Request-Id: my-custom-request-id" http://localhost:3000/api/users
```

The server will use your provided ID instead of generating a new one.

## Response Examples

### Success Response

```http
HTTP/1.1 200 OK
X-Request-Id: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "success": true,
  "statusCode": 200,
  "message": "Users fetched successfully",
  "data": [...],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Error Response

```http
HTTP/1.1 404 Not Found
X-Request-Id: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "success": false,
  "statusCode": 404,
  "message": "User not found",
  "error": "Not Found",
  "errorCode": "NOT_FOUND",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users/123",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Log Examples

### Structured JSON Logs

```json
{
  "level": "INFO",
  "time": "2024-01-01T00:00:00.000Z",
  "service": "skillsync-server",
  "env": "development",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "method": "GET",
  "path": "/api/users",
  "statusCode": 200,
  "duration": "45.123ms",
  "ip": "127.0.0.1",
  "userAgent": "Mozilla/5.0"
}
```

### Error Logs

```json
{
  "level": "ERROR",
  "time": "2024-01-01T00:00:00.000Z",
  "service": "skillsync-server",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "method": "POST",
  "path": "/api/users",
  "statusCode": 500,
  "duration": "120.456ms",
  "stack": "Error: Database connection failed\n    at ..."
}
```

## Database Query Tracing

All database queries include the request ID as a SQL comment, visible in:

- Database slow query logs
- PostgreSQL pg_stat_statements
- Database monitoring tools (DataDog, New Relic, etc.)

### Example Query

```sql
/* request_id: 550e8400-e29b-41d4-a716-446655440000 */ 
SELECT "User"."id" AS "User_id", "User"."email" AS "User_email" 
FROM "users" "User" 
WHERE "User"."id" = $1
```

### Querying Database Logs

Find all queries for a specific request:

```bash
# PostgreSQL logs
grep "550e8400-e29b-41d4-a716-446655440000" /var/log/postgresql/postgresql.log
```

## Performance Impact

Request ID tracing has minimal performance overhead:

- **AsyncLocalStorage overhead**: < 0.1ms per request
- **UUID generation**: ~0.01ms (UUID v4)
- **Database query comment**: ~0.001ms per query
- **Total impact**: < 0.5ms per request

### Performance Test Results

```
RequestContextService performance tests:
  ✓ should have minimal overhead (< 1ms) (23ms for 1000 iterations)
  Average: 0.023ms per operation
```

## Testing

### Unit Tests

Run the test suite:

```bash
npm test -- request-context.service.spec.ts
npm test -- request-logger.middleware.spec.ts
```

### Integration Testing

Test request ID propagation:

```bash
# Test automatic generation
curl -v http://localhost:3000/api/health
# Check response headers for X-Request-Id

# Test distributed tracing
curl -v -H "X-Request-Id: test-123" http://localhost:3000/api/health
# Verify X-Request-Id: test-123 in response
```

## Troubleshooting

### Request ID Missing from Response

1. Check that `RequestLoggerMiddleware` is registered in `main.ts`
2. Verify middleware is applied before routes
3. Check for errors in application startup logs

### Request ID Not in Logs

1. Ensure `RequestContextService.run()` wraps the request handling
2. Verify logger is accessing context via `getRequestId()`
3. Check AsyncLocalStorage is working (Node.js 14+)

### Database Queries Not Commented

1. Verify `DatabaseRequestSubscriber` is registered in `database.config.ts`
2. Check `ENABLE_DB_QUERY_TRACING=true` in `.env`
3. Ensure subscriber is instantiated properly

## Best Practices

1. **Always Include Request ID in Error Reports** - Makes debugging production issues much easier
2. **Use Request ID in Client-Side Logging** - Pass it to frontend for correlated client/server logs
3. **Monitor by Request ID** - Use in APM tools to trace full request lifecycle
4. **Don't Generate IDs Manually** - Let the middleware handle it automatically
5. **Propagate to External Services** - Include `X-Request-Id` in outbound HTTP calls

## Security Considerations

- Request IDs are UUIDs, not predictable
- No sensitive data stored in request context
- Request ID safe to expose in logs and responses
- Can be used for request correlation without security risks

## Future Enhancements

Potential improvements for the tracing system:

- [ ] Add user ID to request context after authentication
- [ ] Propagate request ID to external API calls (HTTP, gRPC)
- [ ] Add distributed tracing headers (W3C Trace Context)
- [ ] Integrate with OpenTelemetry/Jaeger/Zipkin
- [ ] Add request duration metrics by endpoint
- [ ] Create request timeline visualization

## References

- [AsyncLocalStorage Documentation](https://nodejs.org/api/async_context.html)
- [UUID v4 Specification (RFC 4122)](https://tools.ietf.org/html/rfc4122)
- [Distributed Tracing Best Practices](https://opentracing.io/docs/)
- [NestJS Middleware](https://docs.nestjs.com/middleware)
