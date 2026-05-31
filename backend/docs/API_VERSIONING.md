# API Versioning Policy

## Strategy
SkillSync uses **URI Path Versioning** to support future breaking changes without disrupting existing clients. All API endpoints are prefixed with `/api/v<version>/` (e.g., `/api/v1/health`).

## Configuration
- The default version for all controllers is **v1** unless specified otherwise.
- Versioning is configured in `main.ts` using NestJS `VersioningType.URI`.
- The global prefix is set to `api`.

## Creating New Versions
You can specify a version at the **controller level** or **method level**:

```typescript
// Controller-level versioning (applies to all methods)
@Controller({ version: '2', path: 'users' })
export class UsersControllerV2 { ... }

// Method-level versioning
@Controller('app')
export class AppController {
  @Version('1')
  @Get()
  oldRoute() { ... }

  @Version('2')
  @Get()
  newRoute() { ... }
}
```

## Deprecation Timeline
- **Notification:** When a new API version is released, the previous version will be marked as deprecated.
- **Header:** Deprecated versions will respond with a `Deprecation: true` HTTP header. 
- **Grace Period:** Deprecated versions will remain functional for at least **6 months** to allow clients to migrate.
- **Monitoring:** The `VersionCompatibilityMiddleware` logs all usage of deprecated API endpoints to identify clients still using old versions.

## Graceful Handling
- Unsupported or removed versions will return a `404 Not Found` response.
- Missing version in the URI (e.g., `/api/users`) will result in a `404 Not Found` response, as NestJS strictly enforces the URI version prefix once enabled.
