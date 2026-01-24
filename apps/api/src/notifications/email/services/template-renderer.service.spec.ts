import { Test, TestingModule } from '@nestjs/testing';
import { TemplateRendererService } from './template-renderer.service';
import { NotFoundException } from '@nestjs/common';

describe('TemplateRendererService', () => {
  let service: TemplateRendererService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplateRendererService],
    }).compile();

    service = module.get<TemplateRendererService>(TemplateRendererService);
  });

  describe('renderTemplate', () => {
    it('should render HTML template with simple variable interpolation', () => {
      const result = service.renderTemplate('booking-accepted.html', {
        menteeName: 'John Doe',
        mentorName: 'Jane Smith',
        skillName: 'JavaScript',
        sessionDateTime: '2026-02-01 10:00 AM',
        duration: '1 hour',
        dashboardLink: 'http://localhost:3000/bookings',
        currentYear: 2026,
      });

      expect(result).toContain('John Doe');
      expect(result).toContain('Jane Smith');
      expect(result).toContain('JavaScript');
      expect(result).toContain('2026');
    });

    it('should render text template', () => {
      const result = service.renderTemplate('booking-accepted.txt', {
        menteeName: 'John Doe',
        mentorName: 'Jane Smith',
        skillName: 'Python',
        sessionDateTime: '2026-02-02 2:00 PM',
        duration: '1.5 hours',
        dashboardLink: 'http://localhost:3000/bookings',
        currentYear: 2026,
      });

      expect(result).toContain('John Doe');
      expect(result).toContain('Python');
      expect(result).toContain('BOOKING DETAILS');
    });

    it('should handle conditional blocks with truthy values', () => {
      const result = service.renderTemplate('booking-accepted.html', {
        menteeName: 'John',
        mentorName: 'Jane',
        skillName: 'JS',
        sessionDateTime: '2026-02-01 10:00 AM',
        duration: '1 hour',
        sessionLink: 'https://zoom.us/j/123456',
        dashboardLink: 'http://localhost:3000/bookings',
        currentYear: 2026,
      });

      expect(result).toContain('https://zoom.us/j/123456');
      expect(result).not.toContain('{{#if');
    });

    it('should remove conditional blocks with falsy values', () => {
      const result = service.renderTemplate('booking-accepted.html', {
        menteeName: 'John',
        mentorName: 'Jane',
        skillName: 'JS',
        sessionDateTime: '2026-02-01 10:00 AM',
        duration: '1 hour',
        sessionLink: undefined,
        dashboardLink: 'http://localhost:3000/bookings',
        currentYear: 2026,
      });

      expect(result).not.toContain('sessionLink');
      expect(result).not.toContain('{{#if');
    });

    it('should throw NotFoundException for non-existent template', () => {
      expect(() => {
        service.renderTemplate('non-existent.html', {});
      }).toThrow(NotFoundException);
    });

    it('should handle missing variables gracefully', () => {
      const result = service.renderTemplate('booking-accepted.html', {
        menteeName: 'John',
        // Missing other required variables
        currentYear: 2026,
      });

      // Should still render but leave unmatched variables
      expect(result).toContain('John');
      expect(result).toContain('{{mentorName}}');
    });

    it('should handle payment released template', () => {
      const result = service.renderTemplate('payment-released.html', {
        recipientName: 'John Doe',
        amount: '$100.00',
        listingName: 'JavaScript Mentoring',
        transactionId: 'TXN123456',
        transactionDate: '2026-01-23',
        dashboardLink: 'http://localhost:3000/payments',
        currentYear: 2026,
      });

      expect(result).toContain('$100.00');
      expect(result).toContain('JavaScript Mentoring');
      expect(result).toContain('TXN123456');
    });
  });

  describe('getAvailableTemplates', () => {
    it('should return list of available templates', () => {
      const templates = service.getAvailableTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
      expect(templates).toContain('booking-accepted.html');
      expect(templates).toContain('booking-accepted.txt');
      expect(templates).toContain('payment-released.html');
      expect(templates).toContain('payment-released.txt');
    });

    it('should not include hidden files', () => {
      const templates = service.getAvailableTemplates();
      expect(templates.every((t) => !t.startsWith('.'))).toBe(true);
    });
  });
});
