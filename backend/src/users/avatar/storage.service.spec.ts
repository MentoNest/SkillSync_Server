import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalStorageService, S3StorageService } from './storage.service';

describe('StorageService', () => {
  const dir = join(tmpdir(), `skillsync-storage-${Date.now()}`);
  const config = {
    get: jest.fn((key: string) => (key === 'UPLOAD_DIR' ? dir : '/uploads/avatars')),
  } as unknown as ConfigService;

  describe('LocalStorageService', () => {
    const local = new LocalStorageService(config);

    it('writes the buffer and returns a public url', async () => {
      const url = await local.save(Buffer.from('data'), 'a.jpg');
      expect(url).toBe('/uploads/avatars/a.jpg');
      expect(existsSync(join(dir, 'a.jpg'))).toBe(true);
    });

    it('deletes a previously saved file', async () => {
      await local.save(Buffer.from('data'), 'b.jpg');
      await local.delete('/uploads/avatars/b.jpg');
      expect(existsSync(join(dir, 'b.jpg'))).toBe(false);
    });

    it('ignores empty urls', async () => {
      await expect(local.delete(null)).resolves.toBeUndefined();
    });
  });

  describe('S3StorageService', () => {
    it('throws a clear error when credentials are missing', () => {
      const s3 = new S3StorageService({ get: jest.fn(() => undefined) } as unknown as ConfigService);
      expect(() => s3.save()).toThrow(/not configured/);
    });
  });
});
