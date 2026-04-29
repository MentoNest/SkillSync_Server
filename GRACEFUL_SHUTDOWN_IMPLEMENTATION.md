# Graceful Shutdown Implementation

## Overview
This document describes the graceful shutdown implementation for the SkillSync NestJS application.

## Features Implemented

### ✅ 1. SIGTERM and SIGINT Handlers
- **Location**: `src/main.ts`
- Both SIGTERM and SIGINT signals are captured and trigger graceful shutdown
- Handlers are registered after the HTTP server starts listening

### ✅ 2. HTTP Server Graceful Close
- **Location**: `src/common/services/shutdown.service.ts`
- Stops accepting new connections immediately
- Allows in-flight requests to complete within the configured timeout
- Uses `httpServer.close()` which waits for active connections to finish

### ✅ 3. Database Connections Closed
- **Location**: `src/common/services/shutdown.service.ts`
- TypeORM DataSource is properly destroyed using `dataSource.destroy()`
- Errors during DB close are logged but don't prevent shutdown
- Checks if DataSource is initialized before attempting to close

### ✅ 4. Redis Connections Closed
- **Location**: `src/common/services/shutdown.service.ts`
- Redis client is gracefully disconnected using `client.quit()`
- Implemented via `RedisService.onModuleDestroy()`
- Errors during Redis close are logged but don't prevent shutdown

### ✅ 5. In-Flight Request Timeout (30s default)
- **Location**: `src/common/services/shutdown.service.ts`
- Configurable via `SHUTDOWN_TIMEOUT` environment variable (in milliseconds)
- Default: 30000ms (30 seconds)
- Force shutdown with `process.exit(1)` after timeout
- Timeout is cleared if shutdown completes successfully

### ✅ 6. Force Shutdown After Timeout
- **Location**: `src/common/services/shutdown.service.ts`
- If graceful shutdown exceeds timeout, forces exit with code 1
- Prevents application from hanging indefinitely
- Logs warning before forcing exit

### ✅ 7. Health Check Returns 503 During Shutdown
- **Location**: `src/modules/health/health.service.ts`
- Both `/health` and `/health/detailed` endpoints check shutdown state
- Throws `ServiceUnavailableException` (HTTP 503) when shutting down
- Response includes:
  ```json
  {
    "status": "shutting_down",
    "message": "Service is shutting down. Please try again later.",
    "timestamp": "2026-04-29T..."
  }
  ```

### ✅ 8. Shutdown Hooks for Cleanup
- **Location**: `src/common/services/shutdown.service.ts`
- `cleanup()` method provided for custom cleanup operations:
  - Flush log buffers
  - Close file handles
  - Complete pending transactions
  - Send shutdown notifications
- Easily extensible for future cleanup needs

### ✅ 9. Shutdown Progress Logging
- **Location**: `src/common/services/shutdown.service.ts`
- Comprehensive logging throughout shutdown process:
  - Shutdown initiation with signal type
  - Timeout configuration
  - Each step completion with elapsed time
  - Success or failure status
  - Example output:
    ```
    ═══════════════════════════════════════════
    🛑 Graceful shutdown initiated: SIGTERM
    ⏱️  Shutdown timeout: 30000ms
    ═══════════════════════════════════════════
    ✓ HTTP server stopped accepting new connections (50ms)
    ✓ Database connections closed (120ms)
    ✓ Redis connections closed (150ms)
    ✓ Cleanup completed (155ms)
    ✅ Graceful shutdown completed in 155ms
    ═══════════════════════════════════════════
    ```

### ✅ 10. Unit Tests
- **Location**: 
  - `src/common/services/shutdown.service.spec.ts`
  - `src/modules/health/health.service.shutdown.spec.ts`
- Tests cover:
  - SIGTERM and SIGINT signal handling
  - HTTP server close
  - Database connection close
  - Redis connection close
  - Timeout and force shutdown
  - Error handling (DB/Redis close failures)
  - Health check 503 responses
  - Double shutdown prevention

## Configuration

### Environment Variables

Add to `.env`:

```env
# Graceful Shutdown Configuration
# Shutdown timeout in milliseconds (default: 30000 = 30 seconds)
# Time allowed for in-flight requests to complete before force shutdown
SHUTDOWN_TIMEOUT=30000
```

## Architecture

### Files Modified/Created

1. **Created**: `src/common/services/shutdown.service.ts`
   - Main shutdown orchestration service
   - Manages shutdown lifecycle
   - Coordinates closing of all resources

2. **Created**: `src/common/services/shutdown.module.ts`
   - Global module for shutdown service
   - Provides shutdown service to entire application

3. **Created**: `src/common/services/shutdown.service.spec.ts`
   - Unit tests for shutdown service

4. **Created**: `src/modules/health/health.service.shutdown.spec.ts`
   - Unit tests for health check during shutdown

5. **Modified**: `src/main.ts`
   - Added signal handlers (SIGTERM, SIGINT)
   - Integrated shutdown service
   - Added uncaught exception and unhandled rejection handlers

6. **Modified**: `src/app.module.ts`
   - Imported ShutdownModule

7. **Modified**: `src/modules/health/health.service.ts`
   - Added shutdown state checking
   - Returns 503 during shutdown

8. **Modified**: `src/config/config.service.ts`
   - Added `shutdownTimeout` configuration getter

9. **Modified**: `.env.example`
   - Added SHUTDOWN_TIMEOUT documentation

## Shutdown Sequence

```
1. Signal Received (SIGTERM/SIGINT)
   ↓
2. Set isShuttingDown = true
   ↓
3. Start Force Shutdown Timer (configurable timeout)
   ↓
4. Stop Accepting New HTTP Connections
   ↓
5. Close Database Connections (TypeORM)
   ↓
6. Close Redis Connections
   ↓
7. Execute Cleanup Hooks
   ↓
8. Clear Force Shutdown Timer
   ↓
9. Exit with Code 0 (Success)
   
OR (if timeout exceeded)
   
8. Force Exit with Code 1
```

## Usage

### Testing Graceful Shutdown

1. **Start the application**:
   ```bash
   npm run start:dev
   ```

2. **Send SIGTERM signal** (Windows):
   ```powershell
   # Get the process ID
   Get-Process node
   
   # Send SIGTERM
   Stop-Process -Id <PID>
   ```

3. **Send SIGINT signal** (Windows):
   ```powershell
   # Press Ctrl+C in the terminal
   ```

4. **Test health endpoint during shutdown**:
   ```bash
   # In one terminal, start shutdown
   # In another terminal, quickly check health
   curl http://localhost:3000/api/health
   # Should return 503 with shutting_down status
   ```

### Production Deployment

The implementation works seamlessly with:
- **Docker**: Sends SIGTERM by default during `docker stop`
- **Kubernetes**: Sends SIGTERM during pod termination
- **PM2**: Supports graceful shutdown with `pm2 stop`
- **Systemd**: Sends SIGTERM during service stop
- **Cloud Platforms**: AWS, GCP, Azure all send SIGTERM during instance termination

## Error Handling

- **Database close failure**: Logged, shutdown continues
- **Redis close failure**: Logged, shutdown continues
- **Cleanup failure**: Logged, shutdown continues
- **Timeout exceeded**: Force exit with code 1
- **Double shutdown attempt**: Second attempt is ignored

## Best Practices

1. **Set appropriate timeout**: 
   - Consider your longest API operation
   - Default 30s is good for most cases
   - Increase if you have long-running operations

2. **Monitor shutdown logs**:
   - Check elapsed time for each step
   - Identify bottlenecks in shutdown
   - Alert on force shutdowns (timeout exceeded)

3. **Load balancer integration**:
   - Remove instance from load balancer before sending SIGTERM
   - Wait for health check to return 503
   - Then send SIGTERM signal

4. **Database transactions**:
   - The shutdown allows in-flight requests to complete
   - Ensure your requests properly commit/rollback transactions

## Future Enhancements

Potential improvements:
1. Add middleware to reject new requests with 503 during shutdown
2. Add WebSocket connection graceful close
3. Add metrics/tracking for shutdown duration
4. Add shutdown notifications to monitoring systems (Sentry, Datadog, etc.)
5. Add graceful queue worker shutdown
6. Add custom cleanup hooks registration API
