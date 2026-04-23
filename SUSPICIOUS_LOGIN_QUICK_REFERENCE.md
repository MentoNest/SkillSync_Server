## 🚨 Suspicious Login Detection - Quick Reference

### 📦 Imports
```typescript
import { SuspiciousLoginDetectionService } from '@auth/services/suspicious-login-detection.service';
import { 
  LoginContext, 
  SuspiciousLoginResult 
} from '@auth/services/suspicious-login-detection.service';
import { AuditEventType } from '@auth/entities/audit-log.entity';
import { 
  isImpossibleTravel, 
  calculateGeographicDistance 
} from '@common/utils/geolocation.utils';
```

### 🔍 Detection Functions

#### 1️⃣ Detect Suspicious Login
```typescript
// Analyzes a login attempt for suspicious patterns
// Returns risk analysis and recommendations
const context: LoginContext = {
  walletAddress: 'GBRPY...',
  userId: 'user-id',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
  timestamp: new Date(),
};

const result: SuspiciousLoginResult = await suspiciousDetectionService.detectSuspiciousLogin(context);

// Result object:
{
  isSuspicious: boolean;        // true if any detection triggered
  reasons: string[];            // List of detected issues
  riskScore: number;            // 0-100 risk level
  shouldLockAccount: boolean;   // true if score > 70
  lockoutDurationMinutes: 30;   // How long to lock
}
```

#### 2️⃣ Record Failed Attempt
```typescript
// Increments counter and logs failure
// Automatically detects and records suspicious activity
await suspiciousDetectionService.recordFailedAttempt(
  context,
  'Invalid signature' // error message
);
```

#### 3️⃣ Record Login Attempt
```typescript
// Records successful or failed login with full context
// Geolocation, IP history, alerts all triggered here
await suspiciousDetectionService.recordLoginAttempt(
  context,
  true,              // success: true/false
  suspiciousResult   // result from detectSuspiciousLogin
);
```

#### 4️⃣ Check Account Lock Status
```typescript
// Returns boolean - true if account is locked
const isLocked = await suspiciousDetectionService.isAccountLocked(walletAddress);

if (isLocked) {
  throw new ForbiddenException('Account temporarily locked');
}
```

#### 5️⃣ Lock/Unlock Account
```typescript
// Lock account for 30 minutes
await suspiciousDetectionService.lockAccount(walletAddress, 30);

// Unlock immediately
await suspiciousDetectionService.unlockAccount(walletAddress);
```

### 📊 Admin Dashboard APIs

#### Get Suspicious Activities
```typescript
// Query suspicious activities with filters
GET /admin/security/suspicious-activities
  ?startDate=2026-04-01
  &endDate=2026-04-30
  &country=Nigeria
  &onlyLocked=false
  &limit=100
```

#### Get Login History
```typescript
GET /admin/security/login-history/:walletAddress?limit=50
```

#### Get IP History
```typescript
GET /admin/security/ip-history/:walletAddress
```

#### Check Account Status
```typescript
GET /admin/security/account-status/:walletAddress
// Returns: { walletAddress, isLocked }
```

#### Get Statistics
```typescript
GET /admin/security/statistics
// Returns: { totalSuspiciousLast24h, totalLockedAccounts, topCountries[] }
```

#### Unlock Account (Admin Only)
```typescript
POST /admin/security/unlock-account
{
  "walletAddress": "GBRPY...",
  "reason": "Admin override - verified user"
}
```

#### Export as CSV
```typescript
GET /admin/security/export?startDate=2026-04-01&endDate=2026-04-30
```

### 🎨 Integration Patterns

#### Pattern 1: Detect & Block Suspicious Login
```typescript
async login(loginDto: LoginDto, ipAddress: string, userAgent: string) {
  const context = {
    walletAddress: normalizeWalletAddress(loginDto.walletAddress),
    ipAddress,
    userAgent,
    timestamp: new Date(),
  };

  // Check if account is locked
  if (await this.suspiciousService.isAccountLocked(context.walletAddress)) {
    throw new ForbiddenException('Account temporarily locked');
  }

  // Verify signature
  const isValidSignature = await this.verifySignature(...);
  
  if (!isValidSignature) {
    // Record failed attempt
    await this.suspiciousService.recordFailedAttempt(context, 'Invalid signature');
    throw new UnauthorizedException('Invalid signature');
  }

  // Detect suspicious patterns
  const suspiciousResult = await this.suspiciousService.detectSuspiciousLogin(context);
  
  if (suspiciousResult.isSuspicious) {
    await this.suspiciousService.recordLoginAttempt(context, false, suspiciousResult);
    throw new ForbiddenException('Suspicious activity detected');
  }

  // Normal login flow
  const user = await this.userRepository.findOne({ walletAddress: context.walletAddress });
  
  // Record successful login
  suspiciousResult.isSuspicious = false;
  suspiciousResult.reasons = [];
  suspiciousResult.riskScore = 0;
  
  await this.suspiciousService.recordLoginAttempt(context, true, suspiciousResult);
  
  // Generate tokens...
}
```

#### Pattern 2: Audit Logging
```typescript
// All events are automatically logged with geolocation
// Check audit logs for specific user
const history = await suspiciousService.getLoginHistory(walletAddress, 100);

history.forEach(log => {
  console.log(`${log.eventType} from ${log.country} (${log.ipAddress})`);
});
```

#### Pattern 3: Custom Detection
```typescript
// Use geolocation utilities for custom checks
import { isImpossibleTravel, calculateGeographicDistance } from '@common/utils/geolocation.utils';

const lastLocation = { lat: 40.7128, lon: -74.006 }; // NYC
const currentLocation = { lat: 51.5074, lon: -0.1278 }; // London

const distance = calculateGeographicDistance(
  lastLocation.lat, lastLocation.lon,
  currentLocation.lat, currentLocation.lon
); // 5571 km

const timeDiffMinutes = 60;
const isImpossible = isImpossibleTravel(
  lastLocation.lat, lastLocation.lon,
  currentLocation.lat, currentLocation.lon,
  timeDiffMinutes
); // true - can't travel 5571 km in 1 hour
```

### ⚙️ Configuration

```env
# Failed Attempts (default: 5 attempts in 15 minutes)
SECURITY_MAX_FAILED_ATTEMPTS=5
SECURITY_TIME_WINDOW_MINUTES=15

# Account Lockout (default: 30 minutes)
SECURITY_LOCKOUT_DURATION_MINUTES=30

# Risk Thresholds
SECURITY_RISK_THRESHOLD_FOR_SUSPICIOUS=30    # Mark as suspicious
SECURITY_RISK_THRESHOLD_FOR_LOCKOUT=70       # Auto-lock account

# Detection Features
SECURITY_ENABLE_ABNORMAL_TIME_DETECTION=true
SECURITY_ENABLE_IMPOSSIBLE_TRAVEL_DETECTION=true
SECURITY_ENABLE_NEW_IP_DETECTION=true

# Alerts
SECURITY_ENABLE_EMAIL_ALERTS=true
SECURITY_ADMIN_ALERT_EMAIL=admin@skillsync.io
```

### 🔍 Audit Log Fields

```typescript
interface AuditLog {
  id: string;
  userId?: string;
  walletAddress: string;
  eventType: AuditEventType;      // LOGIN_SUCCESS, LOGIN_FAILED, etc.
  ipAddress: string;
  userAgent?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  isSuspicious: boolean;
  suspiciousReasons?: string[];
  errorMessage?: string;
  deviceFingerprint?: string;
  sessionId?: string;
  metadata?: {
    riskScore: number;
    shouldLockAccount: boolean;
  };
  createdAt: Date;
}
```

### 📊 Risk Score Breakdown

| Factor | Base Score | Max |
|--------|-----------|-----|
| Failed attempts | 15/attempt | 40 |
| New IP | 25 | 25 |
| Impossible travel | 50 | 50 |
| Abnormal time | 10 | 10 |
| **Total** | - | **100** |

**Actions:**
- 0-30: Normal (no action)
- 31-70: Suspicious (logged, monitored)
- 71+: High risk (auto-lock account)

### 🆘 Troubleshooting

**Account locked unexpectedly**
- Check: `GET /admin/security/account-status/:walletAddress`
- Unlock: `POST /admin/security/unlock-account`
- Review: `GET /admin/security/login-history/:walletAddress`

**Geolocation not working**
- Verify: `GEOLOCATION_SERVICE_PROVIDER=mock` in .env
- Check IP history: `GET /admin/security/ip-history/:walletAddress`
- Service defaults to mock data if real service unavailable

**High false positives**
- Adjust thresholds in `.env`
- Increase `SECURITY_ABNORMAL_TIME_THRESHOLD_HOURS`
- Increase `SECURITY_RISK_THRESHOLD_FOR_SUSPICIOUS`

**Missing audit logs**
- Verify migration ran: `npm run migration:run`
- Check database connection
- Verify TypeORM has AuditLog entity

### 📚 Common Queries

```typescript
// Get all suspicious logins from specific country
const report = await suspiciousService.getSuspiciousActivityReport({
  country: 'Nigeria',
  limit: 100,
});

// Get last 50 login attempts for user
const history = await suspiciousService.getLoginHistory(walletAddress, 50);

// Check all unique locations user has logged in from
const ipHistory = await suspiciousService.getIPHistory(walletAddress);
console.log(ipHistory.map(h => h.country)); // ['USA', 'Nigeria', 'UK']

// Get all currently locked accounts
const report = await suspiciousService.getSuspiciousActivityReport({
  onlyLocked: true,
});
console.log(report.lockedAccounts); // ['wallet1', 'wallet2', ...]
```

### ✅ Production Checklist

- [ ] Database migration ran successfully
- [ ] Environment variables configured
- [ ] Email alerts set up (if enabled)
- [ ] Admin dashboard tested
- [ ] Geolocation service configured
- [ ] Audit logs being created
- [ ] Account lockout tested
- [ ] Admin unlock capability tested
- [ ] CSV export tested
- [ ] Performance benchmarks acceptable

---

**Status:** ✅ Production Ready
**Version:** 1.0.0
**Last Updated:** April 2026
