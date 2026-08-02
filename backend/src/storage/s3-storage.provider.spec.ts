import { S3StorageProvider } from './s3-storage.provider.js';

const mockSend = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
  DeleteObjectCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
}));

describe('S3StorageProvider', () => {
  let provider: S3StorageProvider;

  const mockConfigService = {
    get: jest.fn((key: string, fallback: unknown) => {
      const values: Record<string, string> = {
        AWS_REGION: 'us-east-1',
        AWS_S3_BUCKET: 'skillsync-avatars',
        AWS_S3_PUBLIC_URL: 'https://cdn.example.com',
        AWS_ACCESS_KEY: 'test-key',
        AWS_SECRET_ACCESS_KEY: 'test-secret',
      };
      return values[key] ?? fallback;
    }),
  };

  beforeEach(() => {
    provider = new S3StorageProvider(mockConfigService as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should upload the object and return the public URL', async () => {
    const url = await provider.upload(
      'avatars/user-1/key-original.jpg',
      Buffer.from('image-bytes'),
      'image/jpeg',
    );

    expect(url).toBe('https://cdn.example.com/avatars/user-1/key-original.jpg');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should send a delete command for the given key', async () => {
    await provider.delete('avatars/user-1/key-original.jpg');

    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
