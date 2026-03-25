# Duration Validation - Quick Reference

## 📋 Validation Rules Summary

| Entity | Unit | Minimum | Maximum | Purpose |
|--------|------|---------|---------|---------|
| **Service Listing** | Hours | 0.5 (30 min) | 24 hours | Mentor service duration |
| **Booking** | Minutes | 15 minutes | 480 min (8 hrs) | Actual booking session length |

## 🎯 How to Use

### Import the Validator
```typescript
import { IsValidDuration, DurationUnit } from '../../../common/decorators/duration.decorator';
```

### Apply to DTO Properties
```typescript
@IsValidDuration({ 
  min: 15,           // minimum value
  max: 480,          // maximum value  
  unit: DurationUnit.MINUTES  // 'minutes' or 'hours'
})
duration: number;
```

## ✅ Valid Examples

### Service Listings (Hours)
- `0.5` ✓ (30 minutes)
- `1.0` ✓ (1 hour)
- `1.5` ✓ (90 minutes)
- `24` ✓ (24 hours)

### Bookings (Minutes)
- `15` ✓ (15 minutes)
- `30` ✓ (30 minutes)
- `60` ✓ (1 hour)
- `480` ✓ (8 hours)

## ❌ Invalid Examples

### Service Listings
- `0.3` ✗ (Below 0.5 hours minimum)
- `25` ✗ (Above 24 hours maximum)
- `-1` ✗ (Negative value)
- `"abc"` ✗ (Not a number)

### Bookings
- `10` ✗ (Below 15 minutes minimum)
- `500` ✗ (Above 480 minutes maximum)
- `NaN` ✗ (Not a number)

## 🔧 Custom Validator Options

```typescript
@IsValidDuration(
  { 
    min: 10,                    // Minimum allowed value
    max: 100,                   // Maximum allowed value
    unit: DurationUnit.MINUTES  // Display unit for errors
  },
  { 
    message: 'Custom error message' // Optional custom message
  }
)
```

## 📝 Error Messages

The validator automatically generates contextual error messages:

- **Below minimum**: `"Duration must be at least X minutes/hours"`
- **Above maximum**: `"Duration must be at most X minutes/hours"`
- **Both limits**: `"Duration must be between X and Y minutes/hours"`

## 🗄️ Database Constraints

Service listings also have database-level validation:

```sql
ALTER TABLE service_listings 
ADD CONSTRAINT "CK_service_listings_duration_range" 
CHECK (duration IS NULL OR (duration >= 0.5 AND duration <= 24))
```

This provides double validation (application + database).

## 🧪 Testing

Run the test suite:
```bash
npm test -- duration.validator.spec.ts
```

Test coverage includes:
- ✅ Valid ranges
- ✅ Boundary values
- ✅ Invalid values
- ✅ Type checking
- ✅ Error message validation

## 🚀 Migration Commands

To apply the database changes:

```bash
# Run all pending migrations
npm run typeorm migration:run

# Revert last migration (if needed)
npm run typeorm migration:revert
```

## 💡 Best Practices

1. **Always use the decorator** in DTOs for consistent validation
2. **Choose appropriate units** based on context (minutes for short durations, hours for long)
3. **Set reasonable limits** that match your business logic
4. **Provide clear examples** in API documentation
5. **Handle validation errors gracefully** in your frontend/client code

## 🔍 Example API Requests

### Create Service Listing
```http
POST /service-listings
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "React Consultation",
  "description": "Expert React.js help",
  "price": 75,
  "duration": 1.5,
  "category": "technical"
}
```

### Create Booking
```http
POST /bookings
Content-Type: application/json
Authorization: Bearer <token>

{
  "serviceListingId": "uuid-here",
  "duration": 60,
  "scheduledAt": "2024-01-15T14:00:00Z",
  "notes": "Need help with hooks"
}
```

## 📦 Files to Know

- **Validator**: `src/common/decorators/duration.decorator.ts`
- **Service Listing DTO**: `src/modules/service-listing/dto/create-service-listing.dto.ts`
- **Booking DTO**: `src/modules/bookings/dto/create-booking.dto.ts`
- **Tests**: `test/duration/duration.validator.spec.ts`
- **Migrations**: `src/migration/`

---

**Need Help?** See [DURATION_VALIDATION_IMPLEMENTATION.md](./DURATION_VALIDATION_IMPLEMENTATION.md) for complete documentation.
