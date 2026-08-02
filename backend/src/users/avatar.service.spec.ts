import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { AvatarService } from './avatar.service.js';
import { User } from './entities/user.entity.js';
import { STORAGE_PROVIDER } from '../storage/storage.constants.js';

jest.mock('sharp', () => jest.fn());

describe('AvatarService', () => {
  let service: AvatarService;

  const mockUserRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockStorage = {
    upload: jest.fn(),
    delete: jest.fn(),
  };

  const mockSharp = sharp as unknown as jest.Mock;

  const makeSharpInstance = (width = 500, height = 500) => ({
    metadata: jest.fn().mockResolvedValue({ width, height }),
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed-image')),
  });

  const buildFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File =>
    ({
      fieldname: 'file',
      originalname: 'avatar.jpg',
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('raw-image'),
      ...overrides,
    }) as Express.Multer.File;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvatarService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: STORAGE_PROVIDER, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<AvatarService>(AvatarService);
    mockSharp.mockReturnValue(makeSharpInstance());
    mockStorage.upload.mockImplementation((key: string) =>
      Promise.resolve(`https://cdn.example.com/${key}`),
    );
    mockStorage.delete.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should reject unsupported file types', async () => {
    const file = buildFile({ mimetype: 'image/gif' });

    await expect(service.uploadAvatar('user-1', file)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject files larger than 5MB', async () => {
    const file = buildFile({ size: 6 * 1024 * 1024 });

    await expect(service.uploadAvatar('user-1', file)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject images smaller than 200x200', async () => {
    mockSharp.mockReturnValue(makeSharpInstance(100, 100));
    const file = buildFile();

    await expect(service.uploadAvatar('user-1', file)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject images larger than 2000x2000', async () => {
    mockSharp.mockReturnValue(makeSharpInstance(2500, 2500));
    const file = buildFile();

    await expect(service.uploadAvatar('user-1', file)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw NotFoundException when the user does not exist', async () => {
    mockUserRepo.findOne.mockResolvedValue(null);
    const file = buildFile();

    await expect(service.uploadAvatar('missing-user', file)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should upload all variants, save the user, and delete the previous avatar', async () => {
    mockUserRepo.findOne.mockResolvedValue({
      id: 'user-1',
      avatarStorageKey: 'avatars/user-1/old-key',
    });
    mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));
    const file = buildFile();

    const result = await service.uploadAvatar('user-1', file);

    expect(mockStorage.upload).toHaveBeenCalledTimes(4);
    expect(result.avatarUrl).toContain('-original.jpg');
    expect(result.avatarThumbnailUrl).toContain('-thumbnail.jpg');
    expect(result.avatarSmallUrl).toContain('-small.jpg');
    expect(result.avatarMediumUrl).toContain('-medium.jpg');
    expect(mockUserRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarUrl: result.avatarUrl,
        avatarThumbnailUrl: result.avatarThumbnailUrl,
      }),
    );
    expect(mockStorage.delete).toHaveBeenCalledTimes(4);
    expect(mockStorage.delete).toHaveBeenCalledWith(
      'avatars/user-1/old-key-original.jpg',
    );
  });

  it('should not attempt to delete anything when there is no previous avatar', async () => {
    mockUserRepo.findOne.mockResolvedValue({
      id: 'user-1',
      avatarStorageKey: null,
    });
    mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));
    const file = buildFile();

    await service.uploadAvatar('user-1', file);

    expect(mockStorage.delete).not.toHaveBeenCalled();
  });
});
