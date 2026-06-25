import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from './encryption.service';

// 64-char hex keys for testing
const TEST_KEY = 'a'.repeat(64);
const TEST_HMAC_KEY = 'b'.repeat(64);

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
    process.env.ENCRYPTION_HMAC_KEY = TEST_HMAC_KEY;

    const module: TestingModule = await Test.createTestingModule({
      providers: [EncryptionService],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_HMAC_KEY;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encrypt / decrypt', () => {
    it('should encrypt a string to a non-plaintext value', () => {
      const plaintext = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
      const ciphertext = service.encrypt(plaintext);
      expect(ciphertext).not.toBe(plaintext);
    });

    it('should produce a colon-separated iv:authTag:ciphertext format', () => {
      const ciphertext = service.encrypt('test');
      expect(ciphertext.split(':').length).toBe(3);
    });

    it('should round-trip: decrypt(encrypt(x)) === x', () => {
      const original = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
      expect(service.decrypt(service.encrypt(original))).toBe(original);
    });

    it('should produce different ciphertexts on each call (random IV)', () => {
      const plaintext = 'same-value';
      expect(service.encrypt(plaintext)).not.toBe(service.encrypt(plaintext));
    });

    it('should throw when ciphertext is tampered', () => {
      const ciphertext = service.encrypt('hello');
      const parts = ciphertext.split(':');
      // Flip the last character of the ciphertext segment
      parts[2] = parts[2].slice(0, -1) + (parts[2].endsWith('0') ? '1' : '0');
      expect(() => service.decrypt(parts.join(':'))).toThrow();
    });

    it('should throw for malformed ciphertext format', () => {
      expect(() => service.decrypt('not-valid-format')).toThrow(
        'Invalid encrypted value format',
      );
    });

    it('should handle unicode characters', () => {
      const value = 'Ärger über Ärger 🎉';
      expect(service.decrypt(service.encrypt(value))).toBe(value);
    });

    it('should complete encrypt+decrypt in under 10ms', () => {
      const value = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
      const start = Date.now();
      service.decrypt(service.encrypt(value));
      expect(Date.now() - start).toBeLessThan(10);
    });
  });

  describe('hash', () => {
    it('should return a 64-character hex string', () => {
      const h = service.hash('wallet-address');
      expect(h).toHaveLength(64);
      expect(h).toMatch(/^[0-9a-f]+$/);
    });

    it('should be deterministic for the same input', () => {
      const value = 'wallet-address';
      expect(service.hash(value)).toBe(service.hash(value));
    });

    it('should produce different hashes for different inputs', () => {
      expect(service.hash('address-a')).not.toBe(service.hash('address-b'));
    });

    it('should be consistent across service instances (same key)', () => {
      const service2 = new EncryptionService();
      expect(service.hash('test')).toBe(service2.hash('test'));
    });
  });
});
