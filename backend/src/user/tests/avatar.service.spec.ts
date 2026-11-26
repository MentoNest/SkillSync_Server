import sharp from 'sharp';
import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  AvatarStorageService,
  resolveAvatarStorageConfig,
} from '../../common/storage/avatar-storage.service';
import {
  AVATAR_SIZES,
  AvatarService,
  MAX_AVATAR_BYTES,
} from '../avatar.service';
import { User } from '../user.entity';
import { UserStatus } from '../user-status.enum';

const WALLET = 'gdqp2kpqgkihyjgxnuiyomharuarca7djt5fo2ffooky3b2wsqhg4w37';

async function createImageBuffer(
  width: number,
  height: number,
  format: 'jpeg' | 'png' | 'webp' = 'jpeg',
): Promise<Buffer> {
  const pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 64, g: 128, b: 200 },
    },
  });
  if (format === 'png') return pipeline.png().toBuffer();
  if (format === 'webp') return pipeline.webp().toBuffer();
  return pipeline.jpeg().toBuffer();
}

function makeUser(overrides: Partial<User> = {}): User {
  const user = new User();
  user.walletAddress = WALLET;
  user.status = UserStatus.ACTIVE;
  user.avatarUrl = null;
  user.avatarThumbnailUrl = null;
  user.avatarSmallUrl = null;
  user.avatarMediumUrl = null;
  return Object.assign(user, overrides);
}

describe('AvatarService', () => {
  it('uploads, validates, optimizes, and generates 4 variants while deleting old avatars', async () => {
    const existingUser = makeUser({
      avatarUrl: '/uploads/avatars/old-orig.jpg',
      avatarThumbnailUrl: '/uploads/avatars/old-thumb.jpg',
      avatarSmallUrl: '/uploads/avatars/old-small.jpg',
      avatarMediumUrl: '/uploads/avatars/old-med.jpg',
    });

    const users = {
      save: jest.fn((u: User) => Promise.resolve(u)),
    };
    const userService = {
      findOrCreate: jest.fn().mockResolvedValue(existingUser),
    };
    const uploads: Array<{ key: string; buffer: Buffer; contentType: string }> =
      [];
    const storage = {
      upload: jest.fn((key: string, buffer: Buffer, contentType: string) => {
        uploads.push({ key, buffer, contentType });
        return Promise.resolve(`/uploads/avatars/${key}`);
      }),
      deleteByUrl: jest.fn().mockResolvedValue(undefined),
    };
    const completeness = { invalidate: jest.fn().mockResolvedValue(undefined) };

    const service = new AvatarService(
      users as never,
      userService as never,
      storage as never,
      completeness as never,
    );
    const buffer = await createImageBuffer(600, 500, 'jpeg');

    const result = await service.uploadAvatar(WALLET.toUpperCase(), {
      originalname: 'avatar.jpg',
      mimetype: 'image/jpeg',
      size: buffer.length,
      buffer,
    });

    expect(uploads).toHaveLength(4);
    expect(result.avatarUrl).toMatch(
      new RegExp(`^/uploads/avatars/${WALLET}/.*-original\\.jpg$`),
    );
    expect(result.avatarThumbnailUrl).toMatch(
      new RegExp(`^/uploads/avatars/${WALLET}/.*-thumbnail\\.jpg$`),
    );
    expect(result.avatarSmallUrl).toMatch(
      new RegExp(`^/uploads/avatars/${WALLET}/.*-small\\.jpg$`),
    );
    expect(result.avatarMediumUrl).toMatch(
      new RegExp(`^/uploads/avatars/${WALLET}/.*-medium\\.jpg$`),
    );

    const thumbMeta = await sharp(
      uploads.find((u) => u.key.includes('-thumbnail.'))!.buffer,
    ).metadata();
    const smallMeta = await sharp(
      uploads.find((u) => u.key.includes('-small.'))!.buffer,
    ).metadata();
    const medMeta = await sharp(
      uploads.find((u) => u.key.includes('-medium.'))!.buffer,
    ).metadata();
    const origMeta = await sharp(
      uploads.find((u) => u.key.includes('-original.'))!.buffer,
    ).metadata();

    expect(thumbMeta).toMatchObject({
      width: AVATAR_SIZES.thumbnail,
      height: AVATAR_SIZES.thumbnail,
      isProgressive: true,
    });
    expect(smallMeta).toMatchObject({
      width: AVATAR_SIZES.small,
      height: AVATAR_SIZES.small,
    });
    expect(medMeta).toMatchObject({
      width: AVATAR_SIZES.medium,
      height: AVATAR_SIZES.medium,
    });
    expect(origMeta).toMatchObject({
      width: 600,
      height: 500,
      isProgressive: true,
    });

    expect(storage.deleteByUrl).toHaveBeenCalledTimes(4);
    expect(completeness.invalidate).toHaveBeenCalledWith(WALLET);
    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarUrl: result.avatarUrl,
        avatarThumbnailUrl: result.avatarThumbnailUrl,
      }),
    );
  });

  it.each([
    ['png', 'png'],
    ['webp', 'webp'],
    ['jpeg', 'jpg'],
  ] as const)('supports %s format', async (format, ext) => {
    const users = { save: jest.fn((u: User) => Promise.resolve(u)) };
    const userService = {
      findOrCreate: jest.fn().mockResolvedValue(makeUser()),
    };
    const storage = {
      upload: jest.fn((key: string) =>
        Promise.resolve(`/uploads/avatars/${key}`),
      ),
      deleteByUrl: jest.fn().mockResolvedValue(undefined),
    };
    const completeness = { invalidate: jest.fn().mockResolvedValue(undefined) };
    const service = new AvatarService(
      users as never,
      userService as never,
      storage as never,
      completeness as never,
    );
    const buffer = await createImageBuffer(300, 300, format);

    const res = await service.uploadAvatar(WALLET, {
      mimetype: `image/${format}`,
      size: buffer.length,
      buffer,
    });
    expect(res.avatarUrl.endsWith(`.${ext}`)).toBe(true);
  });

  it('rejects missing files, unsupported formats, and >5MB files before Sharp processing', async () => {
    const users = { save: jest.fn() };
    const userService = { findOrCreate: jest.fn() };
    const storage = { upload: jest.fn(), deleteByUrl: jest.fn() };
    const completeness = { invalidate: jest.fn() };
    const service = new AvatarService(
      users as never,
      userService as never,
      storage as never,
      completeness as never,
    );

    await expect(
      service.uploadAvatar(WALLET, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.uploadAvatar(WALLET, {
        mimetype: 'image/gif',
        size: 100,
        buffer: Buffer.from('GIF89a'),
      }),
    ).rejects.toThrow(/JPEG, PNG, and WebP/);
    await expect(
      service.uploadAvatar(WALLET, {
        mimetype: 'image/jpeg',
        size: MAX_AVATAR_BYTES + 1,
        buffer: Buffer.from('not-even-parsed'),
      }),
    ).rejects.toThrow(/5MB/);
  });

  it('rejects images smaller than 200x200 or larger than 2000x2000', async () => {
    const users = { save: jest.fn() };
    const userService = { findOrCreate: jest.fn() };
    const storage = { upload: jest.fn(), deleteByUrl: jest.fn() };
    const completeness = { invalidate: jest.fn() };
    const service = new AvatarService(
      users as never,
      userService as never,
      storage as never,
      completeness as never,
    );

    const tooSmall = await createImageBuffer(199, 250, 'png');
    await expect(
      service.uploadAvatar(WALLET, {
        mimetype: 'image/png',
        size: tooSmall.length,
        buffer: tooSmall,
      }),
    ).rejects.toThrow(/200x200/);

    const tooLarge = await createImageBuffer(2001, 300, 'png');
    await expect(
      service.uploadAvatar(WALLET, {
        mimetype: 'image/png',
        size: tooLarge.length,
        buffer: tooLarge,
      }),
    ).rejects.toThrow(/2000x2000/);
  });
});

describe('AvatarStorageService & config resolution', () => {
  it('selects s3 in production when AWS_S3_BUCKET is set and reads AWS_ACCESS_KEY fallback', () => {
    const cfg = resolveAvatarStorageConfig(
      (key) =>
        ({
          NODE_ENV: 'production',
          AWS_S3_BUCKET: 'skillsync-avatars',
          AWS_REGION: 'eu-west-1',
          AWS_ACCESS_KEY: 'AKIA_TEST',
          AWS_SECRET_KEY: 'SECRET_TEST',
        })[key],
    );
    expect(cfg.driver).toBe('s3');
    expect(cfg.s3Bucket).toBe('skillsync-avatars');
    expect(cfg.s3Region).toBe('eu-west-1');
    expect(cfg.s3AccessKeyId).toBe('AKIA_TEST');
    expect(cfg.s3SecretAccessKey).toBe('SECRET_TEST');
  });

  it('writes and deletes local files under AVATAR_UPLOAD_DIR', async () => {
    const tempDir = await fs.mkdtemp(join(tmpdir(), 'skillsync-avatar-test-'));
    const storage = new AvatarStorageService({
      get: (key: string) =>
        ({
          AVATAR_STORAGE_DRIVER: 'local',
          AVATAR_UPLOAD_DIR: tempDir,
          AVATAR_UPLOAD_PUBLIC_PATH: '/uploads/avatars',
        })[key],
    } as never);

    const url = await storage.upload(
      `${WALLET}/test.jpg`,
      Buffer.from('img'),
      'image/jpeg',
    );
    expect(url).toBe(`/uploads/avatars/${WALLET}/test.jpg`);
    await expect(
      fs.stat(join(tempDir, WALLET, 'test.jpg')),
    ).resolves.toBeDefined();

    await storage.deleteByUrl(url);
    await expect(fs.stat(join(tempDir, WALLET, 'test.jpg'))).rejects.toThrow();
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
