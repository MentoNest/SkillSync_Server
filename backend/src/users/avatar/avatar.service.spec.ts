import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { AuditService } from '../../audit/audit.service';
import { User } from '../entities/user.entity';
import { AvatarService } from './avatar.service';
import { StorageService } from './storage.service';

const mockSharpMetadata: { width?: number; height?: number } = { width: 400, height: 400 };

jest.mock('sharp', () => {
  const instance: any = {};
  instance.metadata = jest.fn(() => Promise.resolve(mockSharpMetadata));
  instance.clone = jest.fn(() => instance);
  instance.jpeg = jest.fn(() => instance);
  instance.resize = jest.fn(() => instance);
  instance.toBuffer = jest.fn(() => Promise.resolve(Buffer.from('optimized')));
  const sharp = jest.fn(() => instance);
  return { __esModule: true, default: sharp };
});

const jpeg = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File =>
  ({ mimetype: 'image/jpeg', size: 1024, buffer: Buffer.from('img'), ...overrides }) as Express.Multer.File;

describe('AvatarService', () => {
  let service: AvatarService;
  const users = { findOne: jest.fn(), save: jest.fn(), create: jest.fn() };
  const storage = { save: jest.fn(), delete: jest.fn() };
  const audit = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSharpMetadata.width = 400;
    mockSharpMetadata.height = 400;
    users.findOne.mockResolvedValue({
      id: 'u1',
      avatarUrl: null,
      avatarThumbnailUrl: null,
      avatarSmallUrl: null,
      avatarMediumUrl: null,
    });
    users.save.mockImplementation((user: unknown) => Promise.resolve(user));
    storage.save.mockImplementation((_buffer: Buffer, name: string) => Promise.resolve(`/uploads/avatars/${name}`));
    storage.delete.mockResolvedValue(undefined);
    audit.record.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AvatarService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: StorageService, useValue: storage },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AvatarService);
  });

  it('rejects a missing file', async () => {
    await expect(service.uploadAvatar('u1', undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unsupported mime types', async () => {
    await expect(service.uploadAvatar('u1', jpeg({ mimetype: 'image/gif' }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects files larger than 5MB before any processing', async () => {
    await expect(service.uploadAvatar('u1', jpeg({ size: 6 * 1024 * 1024 }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(users.findOne).not.toHaveBeenCalled();
  });

  it('rejects images smaller than the minimum dimensions', async () => {
    mockSharpMetadata.width = 100;
    mockSharpMetadata.height = 100;
    await expect(service.uploadAvatar('u1', jpeg())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects images larger than the maximum dimensions', async () => {
    mockSharpMetadata.width = 3000;
    mockSharpMetadata.height = 3000;
    await expect(service.uploadAvatar('u1', jpeg())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when the target user does not exist', async () => {
    users.findOne.mockResolvedValue(null);
    await expect(service.uploadAvatar('missing', jpeg())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('generates every size, persists urls and removes the previous avatar', async () => {
    users.findOne.mockResolvedValue({
      id: 'u1',
      avatarUrl: '/uploads/avatars/old.jpg',
      avatarThumbnailUrl: null,
      avatarSmallUrl: null,
      avatarMediumUrl: null,
    });

    const result = await service.uploadAvatar('u1', jpeg());

    expect(storage.save).toHaveBeenCalledTimes(4);
    expect(result.avatarUrl).toMatch(/\.jpg$/);
    expect(result.avatarThumbnailUrl).toContain('-thumbnail.jpg');
    expect(result.avatarSmallUrl).toContain('-small.jpg');
    expect(result.avatarMediumUrl).toContain('-medium.jpg');
    expect(storage.delete).toHaveBeenCalledWith('/uploads/avatars/old.jpg');
    expect(users.save).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
  });
});
