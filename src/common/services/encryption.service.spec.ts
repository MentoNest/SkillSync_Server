import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from './encryption.service';

// Set up test environment variables before anything else
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests-min-32-chars';
process.env.ENCRYPTION_HASH_KEY = 'test-hash-key-for-unit-tests-min-32-chars';
process.env.ENCRYPTION_SALT = 'test-salt';
process.env.ENCRYPTION_HASH_SALT = 'test-hash-salt';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EncryptionService],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encrypt', () => {
    it('should encrypt a string value', () => {
      const plaintext = 'test@example.com';
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBeNull();
      expect(encrypted).not.toBe(plaintext);
      expect(typeof encrypted).toBe('string');
      
      // Encrypted format should be: iv:authTag:ciphertext
      const parts = encrypted.split(':');
      expect(parts.length).toBe(3);
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'test@example.com';
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should return null for null input', () => {
      expect(service.encrypt(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(service.encrypt(undefined)).toBeNull();
    });

    it('should handle empty string', () => {
      const encrypted = service.encrypt('');
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBeNull();
    });

    it('should handle long strings', () => {
      const longString = 'a'.repeat(10000);
      const encrypted = service.encrypt(longString);
      
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBeNull();
    });

    it('should complete encryption in under 10ms', () => {
      const plaintext = 'test@example.com';
      const start = Date.now();
      
      service.encrypt(plaintext);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10);
    });
  });

  describe('decrypt', () => {
    it('should decrypt an encrypted value back to original', () => {
      const plaintext = 'test@example.com';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle round-trip encryption/decryption', () => {
      const testCases = [
        'user@example.com',
        'America/New_York',
        'en-US',
        'Special chars: !@#$%^&*()',
        'Unicode: 你好世界',
        'Spaces and tabs:   \t  ',
      ];

      testCases.forEach((plaintext) => {
        const encrypted = service.encrypt(plaintext);
        const decrypted = service.decrypt(encrypted);
        expect(decrypted).toBe(plaintext);
      });
    });

    it('should return null for null input', () => {
      expect(service.decrypt(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(service.decrypt(undefined)).toBeNull();
    });

    it('should throw error for invalid encrypted format', () => {
      expect(() => service.decrypt('invalid-format')).toThrow('Failed to decrypt value');
    });

    it('should throw error for tampered ciphertext', () => {
      const plaintext = 'test@example.com';
      const encrypted = service.encrypt(plaintext);
      
      // Tamper with the ciphertext by replacing characters
      const parts = encrypted.split(':');
      // Replace the entire ciphertext with invalid data
      parts[2] = Buffer.from('tampered-data-invalid').toString('base64');
      const tampered = parts.join(':');

      expect(() => service.decrypt(tampered)).toThrow('Failed to decrypt value');
    });

    it('should complete decryption in under 10ms', () => {
      const plaintext = 'test@example.com';
      const encrypted = service.encrypt(plaintext);
      const start = Date.now();
      
      service.decrypt(encrypted);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10);
    });
  });

  describe('createSearchHash', () => {
    it('should create a deterministic hash', () => {
      const value = 'test@example.com';
      const hash1 = service.createSearchHash(value);
      const hash2 = service.createSearchHash(value);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBe(64); // SHA-256 produces 64 hex characters
    });

    it('should produce same hash for same value with different cases', () => {
      const hash1 = service.createSearchHash('TEST@EXAMPLE.COM');
      const hash2 = service.createSearchHash('test@example.com');
      const hash3 = service.createSearchHash('Test@Example.Com');

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should produce different hash for different values', () => {
      const hash1 = service.createSearchHash('user1@example.com');
      const hash2 = service.createSearchHash('user2@example.com');

      expect(hash1).not.toBe(hash2);
    });

    it('should return null for null input', () => {
      expect(service.createSearchHash(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(service.createSearchHash(undefined)).toBeNull();
    });

    it('should handle whitespace normalization', () => {
      const hash1 = service.createSearchHash('  test@example.com  ');
      const hash2 = service.createSearchHash('test@example.com');

      expect(hash1).toBe(hash2);
    });

    it('should complete hashing in under 10ms', () => {
      const value = 'test@example.com';
      const start = Date.now();
      
      service.createSearchHash(value);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10);
    });
  });

  describe('encryptFields', () => {
    it('should encrypt specified fields in an object', () => {
      const obj = {
        email: 'test@example.com',
        name: 'John Doe',
        timezone: 'America/New_York',
      };

      const encrypted = service.encryptFields(obj, ['email', 'timezone']);

      expect(encrypted.email).not.toBe('test@example.com');
      expect(encrypted.name).toBe('John Doe'); // Not encrypted
      expect(encrypted.timezone).not.toBe('America/New_York');
    });

    it('should not modify original object', () => {
      const obj = {
        email: 'test@example.com',
        name: 'John Doe',
      };

      service.encryptFields(obj, ['email']);

      expect(obj.email).toBe('test@example.com');
    });
  });

  describe('decryptFields', () => {
    it('should decrypt specified fields in an object', () => {
      const obj = {
        email: service.encrypt('test@example.com'),
        name: 'John Doe',
        timezone: service.encrypt('America/New_York'),
      };

      const decrypted = service.decryptFields(obj, ['email', 'timezone']);

      expect(decrypted.email).toBe('test@example.com');
      expect(decrypted.name).toBe('John Doe'); // Not decrypted
      expect(decrypted.timezone).toBe('America/New_York');
    });

    it('should not modify original object', () => {
      const encryptedEmail = service.encrypt('test@example.com');
      const obj = {
        email: encryptedEmail,
        name: 'John Doe',
      };

      service.decryptFields(obj, ['email']);

      expect(obj.email).toBe(encryptedEmail);
    });
  });

  describe('performance', () => {
    it('should handle 100 encryption operations in under 1 second', () => {
      const start = Date.now();
      
      for (let i = 0; i < 100; i++) {
        service.encrypt(`user${i}@example.com`);
      }
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // 100 ops in < 1000ms = < 10ms per op
    });

    it('should handle 100 decryption operations in under 1 second', () => {
      const encrypted = service.encrypt('test@example.com');
      const start = Date.now();
      
      for (let i = 0; i < 100; i++) {
        service.decrypt(encrypted);
      }
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });

    it('should handle 100 hash operations in under 1 second', () => {
      const start = Date.now();
      
      for (let i = 0; i < 100; i++) {
        service.createSearchHash(`user${i}@example.com`);
      }
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('error handling', () => {
    it('should handle encryption with special characters', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~\\';
      const encrypted = service.encrypt(specialChars);
      const decrypted = service.decrypt(encrypted);
      
      expect(decrypted).toBe(specialChars);
    });

    it('should handle encryption with emojis', () => {
      const emojis = '😀😃😄😁😆😅🤣😂🙂🙃';
      const encrypted = service.encrypt(emojis);
      const decrypted = service.decrypt(encrypted);
      
      expect(decrypted).toBe(emojis);
    });
  });
});
