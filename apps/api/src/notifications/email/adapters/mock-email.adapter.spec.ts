import { Test, TestingModule } from '@nestjs/testing';
import { MockEmailAdapter } from './mock-email.adapter';

describe('MockEmailAdapter', () => {
  let adapter: MockEmailAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MockEmailAdapter],
    }).compile();

    adapter = module.get<MockEmailAdapter>(MockEmailAdapter);
  });

  afterEach(() => {
    adapter.clearSentEmails();
  });

  describe('send', () => {
    it('should send email and return success with messageId', async () => {
      const payload = {
        to: 'test@example.com',
        subject: 'Test Email',
        html: '<p>Test</p>',
        text: 'Test',
      };

      const result = await adapter.send(payload);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toMatch(/^mock-/);
    });

    it('should store sent email for retrieval', async () => {
      const payload = {
        to: 'john@example.com',
        subject: 'Welcome',
        html: '<p>Welcome</p>',
      };

      await adapter.send(payload);

      const sentEmails = adapter.getSentEmails();
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].to).toBe('john@example.com');
      expect(sentEmails[0].subject).toBe('Welcome');
    });

    it('should send multiple emails', async () => {
      const payload1 = {
        to: 'user1@example.com',
        subject: 'Email 1',
        html: '<p>Content 1</p>',
      };

      const payload2 = {
        to: 'user2@example.com',
        subject: 'Email 2',
        html: '<p>Content 2</p>',
      };

      await adapter.send(payload1);
      await adapter.send(payload2);

      const sentEmails = adapter.getSentEmails();
      expect(sentEmails).toHaveLength(2);
      expect(sentEmails[0].to).toBe('user1@example.com');
      expect(sentEmails[1].to).toBe('user2@example.com');
    });

    it('should support additional email fields', async () => {
      const payload = {
        to: 'recipient@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        from: 'sender@example.com',
        replyTo: 'reply@example.com',
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
      };

      await adapter.send(payload);

      const lastEmail = adapter.getLastEmail();
      expect(lastEmail?.from).toBe('sender@example.com');
      expect(lastEmail?.replyTo).toBe('reply@example.com');
      expect(lastEmail?.cc).toEqual(['cc@example.com']);
      expect(lastEmail?.bcc).toEqual(['bcc@example.com']);
    });
  });

  describe('isConfigured', () => {
    it('should always return true (mock is always ready)', () => {
      expect(adapter.isConfigured()).toBe(true);
    });
  });

  describe('getSentEmails', () => {
    it('should return empty array initially', () => {
      const emails = adapter.getSentEmails();
      expect(emails).toEqual([]);
    });

    it('should return all sent emails', async () => {
      const payload1 = { to: 'a@example.com', subject: 'A', html: '' };
      const payload2 = { to: 'b@example.com', subject: 'B', html: '' };

      await adapter.send(payload1);
      await adapter.send(payload2);

      const emails = adapter.getSentEmails();
      expect(emails).toHaveLength(2);
    });

    it('should return copy of array (not reference)', async () => {
      const payload = { to: 'test@example.com', subject: 'Test', html: '' };
      await adapter.send(payload);

      const emails1 = adapter.getSentEmails();
      const emails2 = adapter.getSentEmails();

      expect(emails1).not.toBe(emails2);
      expect(emails1).toEqual(emails2);
    });
  });

  describe('clearSentEmails', () => {
    it('should clear all sent emails', async () => {
      const payload = { to: 'test@example.com', subject: 'Test', html: '' };

      await adapter.send(payload);
      expect(adapter.getSentEmails()).toHaveLength(1);

      adapter.clearSentEmails();
      expect(adapter.getSentEmails()).toHaveLength(0);
    });
  });

  describe('getLastEmail', () => {
    it('should return undefined when no emails sent', () => {
      expect(adapter.getLastEmail()).toBeUndefined();
    });

    it('should return the most recent email', async () => {
      const payload1 = { to: 'first@example.com', subject: 'First', html: '' };
      const payload2 = { to: 'second@example.com', subject: 'Second', html: '' };

      await adapter.send(payload1);
      await adapter.send(payload2);

      const lastEmail = adapter.getLastEmail();
      expect(lastEmail?.to).toBe('second@example.com');
      expect(lastEmail?.subject).toBe('Second');
    });
  });

  describe('findEmailByRecipient', () => {
    it('should find email by recipient address', async () => {
      const payload1 = { to: 'user1@example.com', subject: 'Email 1', html: '' };
      const payload2 = { to: 'user2@example.com', subject: 'Email 2', html: '' };

      await adapter.send(payload1);
      await adapter.send(payload2);

      const email = adapter.findEmailByRecipient('user2@example.com');
      expect(email?.to).toBe('user2@example.com');
      expect(email?.subject).toBe('Email 2');
    });

    it('should return undefined if recipient not found', async () => {
      const payload = { to: 'user@example.com', subject: 'Email', html: '' };
      await adapter.send(payload);

      const email = adapter.findEmailByRecipient('nonexistent@example.com');
      expect(email).toBeUndefined();
    });

    it('should find first matching email if multiple sent to same recipient', async () => {
      const payload1 = { to: 'user@example.com', subject: 'Email 1', html: '' };
      const payload2 = { to: 'user@example.com', subject: 'Email 2', html: '' };

      await adapter.send(payload1);
      await adapter.send(payload2);

      const email = adapter.findEmailByRecipient('user@example.com');
      expect(email?.subject).toBe('Email 1');
    });
  });
});
