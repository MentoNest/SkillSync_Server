import { randomBytes } from 'crypto';
import { FieldEncryptionService, loadEncryptionConfig } from './field-encryption.service';
import { configureColumnEncryption, encryptedColumn } from './encrypted-column.transformer';

const key = () => randomBytes(32).toString('base64');

function service(env: Record<string, string> = {}) {
  return new FieldEncryptionService(
    loadEncryptionConfig({ ENCRYPTION_KEY: key(), ENCRYPTION_INDEX_KEY: key(), ...env } as any),
  );
}

describe('FieldEncryptionService', () => {
  it('round-trips values with AES-256-GCM', () => {
    const s = service();
    const encrypted = s.encrypt('mentor@example.com');
    expect(encrypted.startsWith('v1:k1:')).toBe(true);
    expect(encrypted).not.toContain('mentor@example.com');
    expect(s.decrypt(encrypted)).toBe('mentor@example.com');
  });

  it('uses a fresh IV so equal plaintexts encrypt differently', () => {
    const s = service();
    expect(s.encrypt('same')).not.toBe(s.encrypt('same'));
  });

  it('detects tampering', () => {
    const s = service();
    const parts = s.encrypt('secret').split(':');
    parts[4] = Buffer.from('tampered').toString('base64url');
    expect(() => s.decrypt(parts.join(':'))).toThrow();
  });

  it('supports key rotation: old values decrypt, new writes use the new key', () => {
    const oldKey = key();
    const before = new FieldEncryptionService(
      loadEncryptionConfig({ ENCRYPTION_KEY_ID: 'k1', ENCRYPTION_KEY: oldKey } as any),
    );
    const legacy = before.encrypt('pii');

    const after = new FieldEncryptionService(
      loadEncryptionConfig({
        ENCRYPTION_KEY_ID: 'k2',
        ENCRYPTION_KEY: key(),
        ENCRYPTION_OLD_KEYS: `k1:${oldKey}`,
      } as any),
    );
    expect(after.decrypt(legacy)).toBe('pii');
    const rotated = after.rotate(legacy);
    expect(rotated.startsWith('v1:k2:')).toBe(true);
    expect(after.decrypt(rotated)).toBe('pii');
  });

  it('builds a stable, case-insensitive blind index', () => {
    const s = service();
    expect(s.blindIndex('Mentor@Example.com ')).toBe(s.blindIndex('mentor@example.com'));
    expect(s.blindIndex('a@x.io')).not.toBe(s.blindIndex('b@x.io'));
  });

  it('rejects malformed keys and missing configuration', () => {
    expect(() => loadEncryptionConfig({ ENCRYPTION_KEY: 'c2hvcnQ=' } as any)).toThrow(/32 bytes/);
    expect(() => new FieldEncryptionService(loadEncryptionConfig({} as any)).encrypt('x')).toThrow(
      /not configured/,
    );
  });

  it('performs well enough (under 10 ms per operation)', () => {
    const s = service();
    const start = process.hrtime.bigint();
    for (let i = 0; i < 200; i++) s.decrypt(s.encrypt(`user${i}@example.com`));
    const perOpMs = Number(process.hrtime.bigint() - start) / 1e6 / 400;
    expect(perOpMs).toBeLessThan(10);
  });
});

describe('encryptedColumn transformer', () => {
  it('encrypts on write and decrypts on read, passing legacy plaintext through', () => {
    configureColumnEncryption(service());
    const stored = encryptedColumn.to('a@b.co') as string;
    expect(stored).not.toBe('a@b.co');
    expect(encryptedColumn.from(stored)).toBe('a@b.co');
    expect(encryptedColumn.from('plain-legacy')).toBe('plain-legacy');
    expect(encryptedColumn.to(null)).toBeNull();
  });
});
