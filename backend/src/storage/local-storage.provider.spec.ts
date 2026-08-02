import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalStorageProvider } from './local-storage.provider.js';

describe('LocalStorageProvider', () => {
  let uploadDir: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'skillsync-avatars-'));
    const mockConfigService = {
      get: jest.fn((key: string, fallback: unknown) => {
        if (key === 'LOCAL_UPLOAD_DIR') return uploadDir;
        return fallback;
      }),
    };
    provider = new LocalStorageProvider(mockConfigService as any);
  });

  afterEach(async () => {
    await rm(uploadDir, { recursive: true, force: true });
  });

  it('should write the file and return a public URL', async () => {
    const url = await provider.upload(
      'avatars/user-1/key-original.jpg',
      Buffer.from('image-bytes'),
      'image/jpeg',
    );

    expect(url).toBe('/uploads/avatars/user-1/key-original.jpg');
    const written = await readFile(
      join(uploadDir, 'avatars/user-1/key-original.jpg'),
    );
    expect(written.toString()).toBe('image-bytes');
  });

  it('should remove the file on delete', async () => {
    await provider.upload(
      'avatars/user-1/key-original.jpg',
      Buffer.from('image-bytes'),
      'image/jpeg',
    );

    await provider.delete('avatars/user-1/key-original.jpg');

    await expect(
      readFile(join(uploadDir, 'avatars/user-1/key-original.jpg')),
    ).rejects.toThrow();
  });

  it('should not throw when deleting a file that does not exist', async () => {
    await expect(
      provider.delete('avatars/user-1/missing.jpg'),
    ).resolves.toBeUndefined();
  });
});
