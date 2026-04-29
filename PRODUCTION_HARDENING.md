# Production Environment Configuration Hardening

This document outlines the security hardening measures implemented for production deployment of SkillSync Server.

## 🔒 Security Features Implemented

### 1. Environment Variable Validation

All secrets are validated at application startup. Missing or weak secrets will prevent the application from starting in production.

**Critical Environment Variables:**
- `JWT_SECRET` - Must be at least 32 characters
- `DB_PASSWORD` - Required, no default
- `CORS_ORIGINS` - Required, must be explicitly set
- `REDIS_HOST`, `REDIS_PORT` - Required for cache/session management

**Validation occurs automatically when:**
- `NODE_ENV=production`
- On application bootstrap

### 2. NODE_ENV Configuration

Set `NODE_ENV=production` to enable:
- Stricter rate limiting
- Secure cookie flags (automatic)
- Enhanced security headers
- Swagger UI disabled by default
- Production-optimized error handling

```bash
NODE_ENV=production
```

### 3. CORS - Strict Origin Whitelist

CORS is configured with an explicit whitelist of allowed frontend domains.

**Configuration:**
```bash
# Only these domains can make cross-origin requests
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Allowed HTTP methods
CORS_METHODS=GET,POST,PUT,PATCH,DELETE

# Allow credentials (cookies, auth headers)
CORS_CREDENTIALS=true
```

**Security Features:**
- ✅ Explicit origin validation
- ✅ Blocked origins are logged
- ✅ Preflight caching (10 minutes)
- ✅ Custom allowed/exposed headers

### 4. Swagger UI Protection

Swagger UI is **disabled by default** in production to prevent API documentation exposure.

**Configuration:**
```bash
# Disable Swagger in production (RECOMMENDED)
SWAGGER_ENABLED=false

# Enable only for debugging (use with caution)
SWAGGER_ENABLED=true
```

**Behavior:**
- **Development:** Swagger enabled at `/api-docs`
- **Production:** Disabled unless explicitly enabled via `SWAGGER_ENABLED=true`

### 5. Helmet Security Headers

Helmet is enabled with enhanced security headers:

**Enabled Headers:**
- ✅ Content-Security-Policy (production)
- ✅ Strict-Transport-Security (HSTS) - 1 year with preload
- ✅ X-Content-Type-Options
- ✅ X-Frame-Options
- ✅ X-DNS-Prefetch-Control
- ✅ X-XSS-Protection
- ✅ Cross-Origin-Embedder-Policy

### 6. Trust Proxy Configuration

Enable when running behind a reverse proxy (Nginx, CloudFlare, AWS ALB).

```bash
TRUST_PROXY=true
```

**When to enable:**
- Behind Nginx/Apache reverse proxy
- Using CloudFlare CDN
- AWS Application Load Balancer
- Any proxy that sets `X-Forwarded-*` headers

**What it does:**
- Trusts `X-Forwarded-For` for real client IP
- Enables accurate rate limiting by real IP
- Correct protocol detection (HTTP/HTTPS)

### 7. Cookie Security Flags

All cookies are configured with strict security flags:

**Configuration:**
```bash
# Only send cookies over HTTPS (auto-enabled in production)
COOKIE_SECURE=true

# Prevent JavaScript access (XSS protection)
COOKIE_HTTP_ONLY=true

# CSRF protection
COOKIE_SAME_SITE=strict

# Optional: Cookie domain for subdomain sharing
# COOKIE_DOMAIN=.yourdomain.com

# Cookie expiration (1 hour default)
COOKIE_MAX_AGE=3600000
```

**Security Flags:**
- ✅ **Secure:** Cookies only sent over HTTPS
- ✅ **HttpOnly:** Not accessible via JavaScript (prevents XSS)
- ✅ **SameSite=Strict:** Prevents CSRF attacks

### 8. Rate Limiting - Production Stricter Thresholds

Rate limiting is automatically stricter in production:

| User Type | Development | Production |
|-----------|-------------|------------|
| Unauthenticated (per IP) | 100 req/min | **10 req/min** |
| Authenticated (per user) | 200 req/min | **50 req/min** |
| Global | 100 req/min | **50 req/min** |

**Configuration:**
```bash
# Enable rate limiting
RATE_LIMIT_ENABLED=true

# Global rate limit
RATE_LIMIT_GLOBAL_WINDOW_MS=60000
RATE_LIMIT_GLOBAL_MAX=50

# Unauthenticated users (per IP)
RATE_LIMIT_PER_IP_WINDOW_MS=60000
RATE_LIMIT_PER_IP_MAX=10

# Authenticated users (per user ID)
RATE_LIMIT_PER_USER_WINDOW_MS=60000
RATE_LIMIT_PER_USER_MAX=50

# Exempt paths (health checks, etc.)
RATE_LIMIT_EXEMPT_PATHS=/health,/health/redis
```

## 📋 Production Deployment Checklist

### Environment Variables

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` - Strong random secret (min 32 chars)
  - Generate with: `openssl rand -base64 64`
- [ ] `DB_PASSWORD` - Strong database password
- [ ] `DB_SSL=true` - Enable SSL for database connections
- [ ] `CORS_ORIGINS` - Whitelist your frontend domains (HTTPS only)
- [ ] `TRUST_PROXY=true` - If behind reverse proxy
- [ ] `COOKIE_SECURE=true` - Enforce HTTPS cookies
- [ ] `REDIS_PASSWORD` - Strong Redis password
- [ ] `SWAGGER_ENABLED=false` - Disable API docs in production

### Infrastructure

- [ ] HTTPS enabled (Let's Encrypt, CloudFlare, etc.)
- [ ] Reverse proxy configured (Nginx, Apache)
- [ ] Firewall rules set (only ports 80, 443, 22)
- [ ] Database SSL enabled
- [ ] Redis password protected
- [ ] Regular backups configured

### Kubernetes Probes

Use the public health endpoint at `/health` for liveness and readiness checks.

Example probe configuration:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 15
  periodSeconds: 10
  timeoutSeconds: 2
  failureThreshold: 3
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 2
  failureThreshold: 3
```

The endpoint returns `200 OK` when all critical dependencies are healthy and `503 Service Unavailable` when database, Redis, or disk checks fail.

### Monitoring

- [ ] Application logs monitored
- [ ] CORS violations logged
- [ ] Rate limit violations tracked
- [ ] Failed authentication attempts monitored

## 🚀 Starting in Production Mode

```bash
# Install dependencies
npm install

# Build the application
npm run build

# Set production environment
export NODE_ENV=production

# Start the server
npm run start:prod
```

## 🔍 Validation at Startup

When starting in production mode, the application validates:

1. ✅ All required secrets are present
2. ✅ JWT_SECRET strength (min 32 characters)
3. ✅ CORS_ORIGINS is configured
4. ✅ Database credentials are set

**Example startup log:**
```
[Nest] Bootstrap - 🔒 Production mode detected - validating secrets...
[Nest] ConfigService - ✅ All required secrets validated
[Nest] Bootstrap - 🔒 Trust proxy enabled for reverse proxy (Nginx/CloudFlare)
[Nest] Bootstrap - 🛡 Helmet security headers enabled
[Nest] Bootstrap - 🌍 CORS configured with origins: https://yourdomain.com
[Nest] Bootstrap - 📚 Swagger UI disabled in production
[Nest] Bootstrap - ═══════════════════════════════════════════
[Nest] Bootstrap - 🔒 PRODUCTION SECURITY CONFIGURATION
[Nest] Bootstrap - ═══════════════════════════════════════════
[Nest] Bootstrap - ✓ NODE_ENV: production
[Nest] Bootstrap - ✓ Trust Proxy: Enabled
[Nest] Bootstrap - ✓ Helmet: Enabled with HSTS
[Nest] Bootstrap - ✓ CORS Origins: 1 whitelist(s)
[Nest] Bootstrap - ✓ Cookie Security: Secure=true, HttpOnly=true, SameSite=strict
[Nest] Bootstrap - ✓ Rate Limiting: 50 req/min (authenticated), 10 req/min (unauthenticated)
[Nest] Bootstrap - ✓ Swagger UI: Disabled
[Nest] Bootstrap - ═══════════════════════════════════════════
```

## ⚠️ Security Warnings

The application will log warnings for:

1. **Weak JWT_SECRET:** Less than 32 characters or contains "default"
2. **SameSite=none:** Not recommended for production
3. **Missing secrets:** Application will fail to start
4. **CORS violations:** Blocked origins are logged

## 🔧 Customization

### Adjusting Rate Limits

For high-traffic applications, you may need to increase limits:

```bash
# Authenticated users: 100 req/min
RATE_LIMIT_PER_USER_MAX=100

# Unauthenticated: 20 req/min (for public pages)
RATE_LIMIT_PER_IP_MAX=20
```

### Enabling Swagger for Debugging

If you need Swagger in production temporarily:

```bash
SWAGGER_ENABLED=true
```

**⚠️ WARNING:** Disable after debugging. Consider protecting with basic auth or IP whitelist.

### Cookie Domain for Subdomains

To share cookies across subdomains:

```bash
COOKIE_SAME_SITE=lax
COOKIE_DOMAIN=.yourdomain.com
```

## 📚 Additional Resources

- [NestJS Security Best Practices](https://docs.nestjs.com/security)
- [Helmet Documentation](https://helmetjs.github.io/)
- [CORS Specification](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [OWASP Security Guidelines](https://owasp.org/www-project-top-ten/)
