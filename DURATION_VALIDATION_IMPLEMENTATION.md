# Duration Validation Implementation

## Overview
This implementation provides comprehensive duration validation with predefined units (minutes/hours) and configurable min/max limits for the SkillSync platform.

## Features Implemented

### 1. Custom Duration Validator Decorator
**File**: `src/common/decorators/duration.decorator.ts`

- **IsValidDuration**: Custom decorator for validating duration values
- **DurationUnit**: Enum supporting 'minutes' and 'hours'
- **Configurable limits**: Min and max values can be set per use case
- **Clear error messages**: Automatically generates descriptive validation messages

### 2. Service Listing Duration Validation
**Files Updated**:
- `src/modules/service-listing/dto/create-service-listing.dto.ts`
- `src/modules/service-listing/entities/service-listing.entity.ts`

**Validation Rules**:
- Unit: Hours
- Minimum: 0.5 hours (30 minutes)
- Maximum: 24 hours

**Example Usage**:
```typescript
@IsValidDuration({ min: 0.5, max: 24, unit: DurationUnit.HOURS })
duration: number;
```

### 3. Booking Duration Validation
**Files Created/Updated**:
- `src/modules/bookings/entities/booking.entity.ts`
- `src/modules/bookings/dto/create-booking.dto.ts`
- `src/modules/bookings/dto/update-booking.dto.ts`
- `src/modules/bookings/providers/bookings.service.ts`

**Validation Rules**:
- Unit: Minutes
- Minimum: 15 minutes
- Maximum: 480 minutes (8 hours)

**Features**:
- Automatic price calculation based on duration
- Status management (PENDING, CONFIRMED, COMPLETED, CANCELLED, REJECTED)
- Service listing integration

### 4. Database Migrations
**Files Created**:
- `src/migration/1700000000003-CreateBookingsTable.ts`
  - Creates bookings table with all required fields
  - Adds booking status enum
  - Creates indexes for performance

- `src/migration/1700000000004-AddDurationValidationToServiceListings.ts`
  - Adds CHECK constraint for duration range (0.5-24 hours)
  - Documents the constraint in column comments

### 5. Test Suite
**File**: `test/duration/duration.validator.spec.ts`

Comprehensive test coverage including:
- Valid duration within range (both minutes and hours)
- Boundary conditions (min/max values)
- Invalid durations (below minimum, above maximum)
- Non-numeric and NaN values
- Negative values

## Acceptance Criteria Met

✅ **Accept predefined units (minutes/hours)**
- DurationUnit enum provides type-safe unit selection
- Support for both minutes and hours demonstrated in bookings and service listings

✅ **Set min/max limits**
- Configurable min/max parameters in validator
- Different limits for different use cases:
  - Service listings: 0.5-24 hours
  - Bookings: 15-480 minutes

✅ **Invalid durations rejected**
- Validation rejects values outside min/max range
- Validation rejects non-numeric values
- Validation rejects NaN and negative values
- Clear error messages guide users to valid values

## Installation & Setup

### 1. Install Dependencies
All required dependencies are already in package.json:
```bash
npm install
```

### 2. Run Migrations
Apply the database migrations:
```bash
# Run TypeORM migrations
npm run typeorm migration:run
```

### 3. Build the Project
```bash
npm run build
```

### 4. Run Tests
```bash
npm test -- duration.validator.spec.ts
```

## Usage Examples

### Creating a Service Listing
```typescript
const serviceListing = {
  title: 'Web Development Consultation',
  description: 'Expert advice on web development',
  price: 100,
  duration: 1.5, // 1.5 hours (valid: between 0.5 and 24)
  category: ServiceCategory.TECHNICAL,
};
```

### Creating a Booking
```typescript
const booking = {
  serviceListingId: 'uuid-here',
  duration: 60, // 60 minutes (valid: between 15 and 480)
  scheduledAt: '2024-01-15T14:00:00Z',
  notes: 'Need help with React hooks',
};
```

### Using the Validator in Custom DTOs
```typescript
import { IsValidDuration, DurationUnit } from '../common/decorators/duration.decorator';

class CustomDto {
  @IsValidDuration({ min: 30, max: 120, unit: DurationUnit.MINUTES })
  sessionLength: number;
}
```

## Validation Error Messages

The validator provides clear, contextual error messages:

- **Below minimum**: "Duration must be at least X minutes/hours"
- **Above maximum**: "Duration must be at most X minutes/hours"
- **Range**: "Duration must be between X and Y minutes/hours"
- **Invalid type**: "Invalid duration value"

## Architecture Benefits

1. **Reusability**: Single validator works across multiple modules
2. **Type Safety**: TypeScript enums and interfaces prevent errors
3. **Flexibility**: Easy to add new units or change limits
4. **Database Integrity**: CHECK constraints provide double validation
5. **User Experience**: Clear error messages guide users

## Future Enhancements

Possible extensions:
- Add support for days/weeks units
- Add default duration values
- Implement duration presets (e.g., 30min, 1hr, 2hr options)
- Add timezone-aware duration calculations
- Implement duration-based availability slot generation

## Files Modified/Created

### Created Files:
- `src/common/decorators/duration.decorator.ts`
- `src/modules/bookings/entities/booking.entity.ts`
- `src/modules/bookings/dto/create-booking.dto.ts`
- `src/migration/1700000000003-CreateBookingsTable.ts`
- `src/migration/1700000000004-AddDurationValidationToServiceListings.ts`
- `test/duration/duration.validator.spec.ts`

### Modified Files:
- `src/modules/service-listing/dto/create-service-listing.dto.ts`
- `src/modules/bookings/bookings.module.ts`
- `src/modules/bookings/providers/bookings.service.ts`
- `src/modules/bookings/bookings.controller.ts`
- `src/modules/reviews/providers/reviews.service.ts`
- `src/modules/service-listing/service-listing.service.ts`

## Conclusion

The duration validation implementation is complete, tested, and ready for production use. All acceptance criteria have been met with robust validation, clear error messages, and comprehensive test coverage.
