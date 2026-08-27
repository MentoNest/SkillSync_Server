import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService, EncryptedField } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = EncryptionService.generateKey();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EncryptionService],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const plaintext = 'test@example.com';
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('data');
      expect(encrypted).toHaveProperty('tag');
      expect(encrypted).toHaveProperty('salt');
      expect(encrypted.data).not.toBe(plaintext);

      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (random IV/salt)', () => {
      const plaintext = 'test@example.com';
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      expect(encrypted1.data).not.toBe(encrypted2.data);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it('should handle empty strings', () => {
      const encrypted = service.encrypt('');
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe('');
    });

    it('should handle special characters', () => {
      const plaintext = 'user+tag@example.com!@#$%^&*()';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('hashForSearch', () => {
    it('should produce consistent hashes', () => {
      const hash1 = service.hashForSearch('test@example.com');
      const hash2 = service.hashForSearch('test@example.com');
      expect(hash1).toBe(hash2);
    });

    it('should be case-insensitive', () => {
      const hash1 = service.hashForSearch('Test@Example.com');
      const hash2 = service.hashForSearch('test@example.com');
      expect(hash1).toBe(hash2);
    });

    it('should trim whitespace', () => {
      const hash1 = service.hashForSearch('  test@example.com  ');
      const hash2 = service.hashForSearch('test@example.com');
      expect(hash1).toBe(hash2);
    });
  });

  describe('encryptFields/decryptFields', () => {
    it('should encrypt and decrypt specified fields', () => {
      const entity = {
        id: '123',
        email: 'test@example.com',
        displayName: 'Test User',
        bio: 'Hello world',
      };

      const encrypted = service.encryptFields(entity, ['email', 'displayName']);
      expect(encrypted.id).toBe('123');
      expect(encrypted.email).not.toBe('test@example.com');
      expect(encrypted.displayName).not.toBe('Test User');
      expect(encrypted.bio).toBe('Hello world');

      const decrypted = service.decryptFields(encrypted, ['email', 'displayName']);
      expect(decrypted.email).toBe('test@example.com');
      expect(decrypted.displayName).toBe('Test User');
    });

    it('should handle null/undefined fields', () => {
      const entity = {
        id: '123',
        email: null,
        displayName: undefined,
      };

      const encrypted = service.encryptFields(entity, ['email', 'displayName']);
      expect(encrypted.email).toBeNull();
      expect(encrypted.displayName).toBeUndefined();
    });
  });

  describe('generateKey', () => {
    it('should generate a valid hex key', () => {
      const key = EncryptionService.generateKey();
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate unique keys', () => {
      const key1 = EncryptionService.generateKey();
      const key2 = EncryptionService.generateKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('error handling', () => {
    it('should throw on missing ENCRYPTION_KEY', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => new EncryptionService()).toThrow('ENCRYPTION_KEY');
    });

    it('should throw on invalid encrypted data', () => {
      const invalid: EncryptedField = {
        iv: 'invalid',
        data: 'invalid',
        tag: 'invalid',
        salt: 'invalid',
      };
      expect(() => service.decrypt(invalid)).toThrow();
    });
  });
});
