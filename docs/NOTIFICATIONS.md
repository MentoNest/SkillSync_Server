# Email Notifications System

## Overview

The email notifications system provides a flexible, provider-agnostic way to send emails for key events in the SkillSync platform. The system is built with a pluggable adapter pattern, allowing you to switch between different email providers (SendGrid, Resend, AWS SES, etc.) without changing the application code.

## Architecture

### Components

1. **EmailAdapter Interface** (`email-adapter.interface.ts`)
   - Abstract interface that defines the contract for email providers
   - Allows swapping between different implementations

2. **MockEmailAdapter** (`mock-email.adapter.ts`)
   - Development and testing adapter
   - Logs emails to console and stores in memory
   - No actual email sending

3. **TemplateRendererService** (`template-renderer.service.ts`)
   - Renders email templates with variable interpolation
   - Supports simple conditional blocks
   - Loads templates from the file system

4. **EmailNotificationService** (`email-notification.service.ts`)
   - High-level service for sending specific email types
   - Uses adapter and template renderer
   - Handles booking and payment notifications

5. **NotificationsModule** (`notifications.module.ts`)
   - NestJS module that wires everything together
   - Provides dependency injection for email services

## Project Structure

```
src/notifications/
├── notifications.module.ts
└── email/
    ├── index.ts
    ├── interfaces/
    │   ├── index.ts
    │   └── email-adapter.interface.ts
    ├── adapters/
    │   ├── index.ts
    │   ├── mock-email.adapter.ts
    │   └── mock-email.adapter.spec.ts
    ├── services/
    │   ├── index.ts
    │   ├── email-notification.service.ts
    │   ├── email-notification.service.spec.ts
    │   ├── template-renderer.service.ts
    │   └── template-renderer.service.spec.ts
    └── templates/
        ├── booking-accepted.html
        ├── booking-accepted.txt
        ├── payment-released.html
        └── payment-released.txt
```

## Environment Configuration

### Current Setup

```env
# Email provider (default: mock)
EMAIL_PROVIDER=mock

# Application URL (for email links)
APP_URL=http://localhost:3000
```

### Future Providers

To add new email providers, create a new adapter class:

```typescript
// sendgrid-email.adapter.ts
export class SendGridEmailAdapter implements IEmailAdapter {
  constructor(private readonly configService: ConfigService) {}

  async send(payload: EmailPayload): Promise<{ success: boolean; messageId: string }> {
    // Implementation using SendGrid client
  }

  isConfigured(): boolean {
    return !!this.configService.get('SENDGRID_API_KEY');
  }
}
```

Then update the NotificationsModule:

```typescript
@Module({
  providers: [
    {
      provide: 'EMAIL_ADAPTER',
      useClass: process.env.EMAIL_PROVIDER === 'sendgrid' 
        ? SendGridEmailAdapter 
        : MockEmailAdapter,
    },
    // ...
  ],
})
export class NotificationsModule {}
```

## Email Templates

### Booking Accepted Template

**File:** `src/notifications/email/templates/booking-accepted.html`

**Variables:**
- `menteeName` - First name of the mentee
- `mentorName` - First name of the mentor
- `skillName` - Name of the skill being taught
- `sessionDateTime` - Date and time of the session
- `duration` - Duration of the session (e.g., "1 hour")
- `sessionLink` (optional) - Link to join the session (video call, etc.)
- `dashboardLink` - Link to the booking dashboard
- `currentYear` - Current year (for copyright)

**Example Rendered Output:**
```
Hello John,

Great news! Your booking request has been accepted by your mentor. You're all set for your session!

---

BOOKING DETAILS
Mentor: Jane Smith
Skill: JavaScript
Date & Time: February 1, 2026, 10:00 AM
Duration: 1 hour
Join: https://zoom.us/j/123456789

---

Please make sure to join the session on time. If you have any questions, feel free to message your mentor directly.

View Session Details: http://localhost:3000/bookings

© 2026 SkillSync. All rights reserved.
```

### Payment Released Template

**File:** `src/notifications/email/templates/payment-released.html`

**Variables:**
- `recipientName` - Name of the payment recipient
- `amount` - Amount released (e.g., "$100.00")
- `listingName` - Name of the listing/skill
- `transactionId` - Unique transaction identifier
- `transactionDate` - Date of the transaction
- `bankAccount` (optional) - Last 4 digits of bank account
- `referenceNumber` (optional) - Reference number for the transaction
- `dashboardLink` - Link to the payments dashboard
- `currentYear` - Current year

**Example Rendered Output:**
```
Hello John,

Your payment has been successfully processed and released. See the details below.

AMOUNT: $150.00

---

PAYMENT DETAILS
Listing: Advanced React Development
Transaction ID: TXN123456789
Date: January 23, 2026
Destination: ****1234
Reference: REF2026001

---

The funds have been transferred to your associated bank account. Please allow 1-3 business days for the payment to appear in your account.

View Payment Details: http://localhost:3000/payments

© 2026 SkillSync. All rights reserved.
```

## Template Syntax

### Variable Interpolation

Variables are enclosed in double curly braces:

```html
<p>Hello {{menteeName}},</p>
```

### Conditional Blocks

Show/hide content based on variable presence:

```html
{{#if sessionLink}}
  <p>Join: <a href="{{sessionLink}}">Click here</a></p>
{{/if}}
```

## Usage

### Sending Booking Accepted Email

```typescript
import { EmailNotificationService } from '@/notifications/email/services/email-notification.service';

export class BookingsService {
  constructor(
    private readonly emailNotificationService: EmailNotificationService,
  ) {}

  async acceptBooking(bookingId: string): Promise<void> {
    // ... accept booking logic ...

    // Send notification email (async, non-blocking)
    await this.emailNotificationService.sendBookingAcceptedEmail({
      menteeName: 'John Doe',
      menteeEmail: 'john@example.com',
      mentorName: 'Jane Smith',
      skillName: 'JavaScript',
      sessionDateTime: 'February 1, 2026 at 10:00 AM',
      duration: '1 hour',
      sessionLink: 'https://zoom.us/j/123456',
      dashboardLink: this.emailNotificationService.buildDashboardLink('bookings'),
    });
  }
}
```

### Sending Payment Released Email

```typescript
import { EmailNotificationService } from '@/notifications/email/services/email-notification.service';

export class PaymentsService {
  constructor(
    private readonly emailNotificationService: EmailNotificationService,
  ) {}

  async releasePayment(paymentId: string): Promise<void> {
    // ... release payment logic ...

    // Send notification email
    await this.emailNotificationService.sendPaymentReleasedEmail({
      recipientName: 'Jane Smith',
      recipientEmail: 'jane@example.com',
      amount: '$150.00',
      listingName: 'Advanced JavaScript',
      transactionId: 'TXN123456789',
      transactionDate: '2026-01-23',
      bankAccount: '****5678',
      referenceNumber: 'REF2026001',
      dashboardLink: this.emailNotificationService.buildDashboardLink('payments'),
    });
  }
}
```

## Testing with MockEmailAdapter

The MockEmailAdapter stores all sent emails in memory for testing:

```typescript
describe('BookingsService', () => {
  let mockAdapter: MockEmailAdapter;

  beforeEach(() => {
    // Get the mock adapter from the module
    mockAdapter = app.get<MockEmailAdapter>(MockEmailAdapter);
  });

  it('should send booking accepted email', async () => {
    await bookingsService.acceptBooking(bookingId);

    const email = mockAdapter.getLastEmail();
    expect(email?.to).toBe('john@example.com');
    expect(email?.subject).toBe('Your booking has been accepted');
    expect(email?.html).toContain('Jane Smith');
  });
});
```

### Available Mock Methods

- `getSentEmails()` - Get all sent emails
- `getLastEmail()` - Get the most recent email
- `findEmailByRecipient(email)` - Find an email by recipient address
- `clearSentEmails()` - Clear all stored emails (useful for test cleanup)

## Non-Blocking Email Sending

Email sending is intentionally **non-blocking**:

```typescript
// Email sends in the background, request completes immediately
await this.emailNotificationService.sendBookingAcceptedEmail(params);
```

If email sending fails, it's logged but doesn't affect the main request. This ensures that:
1. User-facing operations complete quickly
2. Email failures don't impact the API response
3. Email issues are visible in logs for debugging

## Future Enhancements

### Queue-Based Sending

For production, consider implementing a job queue for email sending:

```typescript
// Example using Bull queue
async acceptBooking(bookingId: string): Promise<void> {
  // ... accept booking logic ...

  // Queue email for sending
  await this.emailQueue.add('send-booking-accepted', {
    bookingId,
    menteeName: 'John Doe',
    // ...
  });
}
```

### Email Retry Logic

Implement automatic retries for failed emails:

```typescript
// Configure adapter with retry settings
{
  provide: 'EMAIL_ADAPTER',
  useFactory: () => {
    return new SendGridEmailAdapter({
      maxRetries: 3,
      retryDelay: 1000,
    });
  },
}
```

### Event-Based Notifications

Use NestJS EventEmitter for decoupled email triggers:

```typescript
@EventListener('booking.accepted')
async onBookingAccepted(event: BookingAcceptedEvent) {
  await this.emailNotificationService.sendBookingAcceptedEmail({
    // ... params ...
  });
}
```

### Email Metrics

Track email delivery:

```typescript
// Log metrics to monitoring system
const result = await this.emailAdapter.send(payload);
await this.metricsService.recordEmailSent({
  provider: 'sendgrid',
  type: 'booking-accepted',
  success: result.success,
  duration: endTime - startTime,
});
```

## Adding New Email Templates

1. Create HTML template in `src/notifications/email/templates/`
2. Create text variant (optional but recommended)
3. Add rendering method to `EmailNotificationService`
4. Add interface for params (e.g., `BookingAcceptedEmailParams`)
5. Wire into the event that triggers it

## Configuration Examples

### Development (Mock)

```env
EMAIL_PROVIDER=mock
APP_URL=http://localhost:3000
```

### Staging (SendGrid)

```env
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxx
APP_URL=https://staging.skillsync.com
SENDGRID_FROM_EMAIL=noreply@staging.skillsync.com
```

### Production (AWS SES)

```env
EMAIL_PROVIDER=aws-ses
AWS_SES_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxx
APP_URL=https://skillsync.com
```

## Troubleshooting

### Emails Not Sending

1. Check `EMAIL_PROVIDER` environment variable
2. Verify adapter configuration (API keys, credentials)
3. Check application logs for error messages
4. Ensure all required template variables are provided

### Template Variables Not Rendering

1. Verify variable names match template exactly
2. Check for typos in template syntax
3. Test with MockEmailAdapter to inspect rendered content

### Email Content Issues

1. Test with MockEmailAdapter's `getLastEmail()` method
2. View HTML rendering in browser
3. Check email client compatibility
4. Use text fallback for email clients that don't support HTML

## Performance Considerations

- Template rendering: ~1ms per template
- Email sending (mock): Instantaneous
- Email sending (real provider): Depends on provider, typically 50-500ms
- No caching needed due to fast render times

## Security Best Practices

1. **Never log sensitive data:** Passwords, tokens, personal info
2. **Use environment variables** for API keys
3. **Sanitize user input** before including in templates
4. **Use reply-to addresses** separate from from address
5. **Validate email addresses** before sending
6. **Implement rate limiting** to prevent spam

## API Reference

### EmailNotificationService

#### `sendBookingAcceptedEmail(params: BookingAcceptedEmailParams)`

Sends a booking accepted notification email.

**Parameters:**
```typescript
{
  menteeName: string;
  menteeEmail: string;
  mentorName: string;
  skillName: string;
  sessionDateTime: string;
  duration: string;
  sessionLink?: string;
  dashboardLink: string;
}
```

**Returns:** `Promise<void>`

#### `sendPaymentReleasedEmail(params: PaymentReleasedEmailParams)`

Sends a payment released notification email.

**Parameters:**
```typescript
{
  recipientName: string;
  recipientEmail: string;
  amount: string;
  listingName: string;
  transactionId: string;
  transactionDate: string;
  bankAccount?: string;
  referenceNumber?: string;
  dashboardLink: string;
}
```

**Returns:** `Promise<void>`

#### `buildDashboardLink(path?: string)`

Builds a fully-qualified dashboard URL.

**Parameters:**
- `path` (optional): Path relative to APP_URL. Defaults to "dashboard"

**Returns:** `string` - Full URL

### TemplateRendererService

#### `renderTemplate(templateName: string, variables: Record<string, any>)`

Renders a template with the provided variables.

**Parameters:**
- `templateName`: Filename of the template (e.g., "booking-accepted.html")
- `variables`: Key-value object for interpolation

**Returns:** `string` - Rendered template

#### `getAvailableTemplates()`

Lists all available template files.

**Returns:** `string[]` - Array of template filenames

### MockEmailAdapter

#### `send(payload: EmailPayload)`

Sends an email (mock only).

**Parameters:**
```typescript
{
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
}
```

**Returns:** `Promise<{ success: boolean; messageId: string }>`

#### `getSentEmails()`

Gets all sent emails for testing.

**Returns:** `EmailPayload[]`

#### `findEmailByRecipient(email: string)`

Finds an email by recipient address.

**Returns:** `EmailPayload | undefined`

#### `getLastEmail()`

Gets the most recent email.

**Returns:** `EmailPayload | undefined`

#### `clearSentEmails()`

Clears all stored emails.

**Returns:** `void`

## Contributing

When adding new email templates or adapters:

1. Follow the existing code style
2. Add comprehensive JSDoc comments
3. Include HTML and text variants
4. Add unit tests with >90% coverage
5. Update this documentation
6. Test with MockEmailAdapter first

## Support

For issues or questions about the email notification system:
1. Check the troubleshooting section
2. Review the test files for usage examples
3. File an issue with:
   - Email type (booking/payment)
   - Error message from logs
   - Environment configuration
   - Steps to reproduce
