import { Test, TestingModule } from '@nestjs/testing';
import { EmailNotificationService } from './email-notification.service';
import { TemplateRendererService } from './template-renderer.service';
import { MockEmailAdapter } from '../adapters/mock-email.adapter';
import { ConfigService } from '@nestjs/config';

describe('EmailNotificationService', () => {
  let service: EmailNotificationService;
  let templateRenderer: TemplateRendererService;
  let mockAdapter: MockEmailAdapter;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailNotificationService,
        TemplateRendererService,
        MockEmailAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: any) => {
              const config = {
                EMAIL_PROVIDER: 'mock',
                APP_URL: 'http://localhost:3000',
              };
              return config[key] || defaultValue;
            },
          },
        },
        {
          provide: 'EMAIL_ADAPTER',
          useClass: MockEmailAdapter,
        },
      ],
    }).compile();

    service = module.get<EmailNotificationService>(EmailNotificationService);
    templateRenderer = module.get<TemplateRendererService>(TemplateRendererService);
    mockAdapter = module.get<MockEmailAdapter>(MockEmailAdapter);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    mockAdapter.clearSentEmails();
  });

  describe('sendBookingAcceptedEmail', () => {
    it('should send booking accepted email with correct subject and recipient', async () => {
      const params = {
        menteeName: 'John Doe',
        menteeEmail: 'john@example.com',
        mentorName: 'Jane Smith',
        skillName: 'JavaScript',
        sessionDateTime: '2026-02-01 10:00 AM',
        duration: '1 hour',
        dashboardLink: 'http://localhost:3000/bookings',
      };

      await service.sendBookingAcceptedEmail(params);

      const lastEmail = mockAdapter.getLastEmail();
      expect(lastEmail).toBeDefined();
      expect(lastEmail?.to).toBe('john@example.com');
      expect(lastEmail?.subject).toBe('Your booking has been accepted');
    });

    it('should render HTML template with variables', async () => {
      const params = {
        menteeName: 'John Doe',
        menteeEmail: 'john@example.com',
        mentorName: 'Jane Smith',
        skillName: 'React',
        sessionDateTime: '2026-02-01 2:00 PM',
        duration: '1.5 hours',
        dashboardLink: 'http://localhost:3000/bookings',
      };

      await service.sendBookingAcceptedEmail(params);

      const lastEmail = mockAdapter.getLastEmail();
      expect(lastEmail?.html).toContain('Jane Smith');
      expect(lastEmail?.html).toContain('React');
      expect(lastEmail?.html).toContain('John Doe');
    });

    it('should include plain text variant', async () => {
      const params = {
        menteeName: 'John Doe',
        menteeEmail: 'john@example.com',
        mentorName: 'Jane Smith',
        skillName: 'Python',
        sessionDateTime: '2026-02-02 3:00 PM',
        duration: '2 hours',
        dashboardLink: 'http://localhost:3000/bookings',
      };

      await service.sendBookingAcceptedEmail(params);

      const lastEmail = mockAdapter.getLastEmail();
      expect(lastEmail?.text).toBeDefined();
      expect(lastEmail?.text).toContain('Jane Smith');
      expect(lastEmail?.text).toContain('Python');
    });

    it('should include optional sessionLink in email', async () => {
      const params = {
        menteeName: 'John Doe',
        menteeEmail: 'john@example.com',
        mentorName: 'Jane Smith',
        skillName: 'JavaScript',
        sessionDateTime: '2026-02-01 10:00 AM',
        duration: '1 hour',
        sessionLink: 'https://zoom.us/j/123456',
        dashboardLink: 'http://localhost:3000/bookings',
      };

      await service.sendBookingAcceptedEmail(params);

      const lastEmail = mockAdapter.getLastEmail();
      expect(lastEmail?.html).toContain('https://zoom.us/j/123456');
    });

    it('should not break on missing optional fields', async () => {
      const params = {
        menteeName: 'John Doe',
        menteeEmail: 'john@example.com',
        mentorName: 'Jane Smith',
        skillName: 'JavaScript',
        sessionDateTime: '2026-02-01 10:00 AM',
        duration: '1 hour',
        dashboardLink: 'http://localhost:3000/bookings',
      };

      await service.sendBookingAcceptedEmail(params);

      const lastEmail = mockAdapter.getLastEmail();
      expect(lastEmail).toBeDefined();
      expect(lastEmail?.html).not.toContain('{{#if sessionLink}}');
    });
  });

  describe('sendPaymentReleasedEmail', () => {
    it('should send payment released email with correct subject and recipient', async () => {
      const params = {
        recipientName: 'John Doe',
        recipientEmail: 'john@example.com',
        amount: '$100.00',
        listingName: 'JavaScript Mentoring',
        transactionId: 'TXN123456',
        transactionDate: '2026-01-23',
        dashboardLink: 'http://localhost:3000/payments',
      };

      await service.sendPaymentReleasedEmail(params);

      const lastEmail = mockAdapter.getLastEmail();
      expect(lastEmail).toBeDefined();
      expect(lastEmail?.to).toBe('john@example.com');
      expect(lastEmail?.subject).toBe('Your payment has been released');
    });

    it('should render payment template with variables', async () => {
      const params = {
        recipientName: 'Jane Smith',
        recipientEmail: 'jane@example.com',
        amount: '$250.00',
        listingName: 'Advanced Python',
        transactionId: 'TXN789012',
        transactionDate: '2026-01-23',
        dashboardLink: 'http://localhost:3000/payments',
      };

      await service.sendPaymentReleasedEmail(params);

      const lastEmail = mockAdapter.getLastEmail();
      expect(lastEmail?.html).toContain('$250.00');
      expect(lastEmail?.html).toContain('Advanced Python');
      expect(lastEmail?.html).toContain('TXN789012');
    });

    it('should include optional bank account and reference fields', async () => {
      const params = {
        recipientName: 'John Doe',
        recipientEmail: 'john@example.com',
        amount: '$150.00',
        listingName: 'React Fundamentals',
        transactionId: 'TXN345678',
        transactionDate: '2026-01-23',
        bankAccount: '****1234',
        referenceNumber: 'REF2026001',
        dashboardLink: 'http://localhost:3000/payments',
      };

      await service.sendPaymentReleasedEmail(params);

      const lastEmail = mockAdapter.getLastEmail();
      expect(lastEmail?.html).toContain('****1234');
      expect(lastEmail?.html).toContain('REF2026001');
    });
  });

  describe('getEmailProvider', () => {
    it('should return configured email provider', () => {
      const provider = service.getEmailProvider();
      expect(provider).toBe('mock');
    });
  });

  describe('buildDashboardLink', () => {
    it('should build correct dashboard link', () => {
      const link = service.buildDashboardLink('bookings');
      expect(link).toBe('http://localhost:3000/bookings');
    });

    it('should use default path', () => {
      const link = service.buildDashboardLink();
      expect(link).toBe('http://localhost:3000/dashboard');
    });
  });
});
