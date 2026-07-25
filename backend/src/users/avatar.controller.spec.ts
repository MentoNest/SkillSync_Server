import { Test, TestingModule } from '@nestjs/testing';
import { AvatarController } from './avatar.controller.js';
import { AvatarService } from './avatar.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

describe('AvatarController', () => {
  let controller: AvatarController;

  const mockAvatarService = {
    uploadAvatar: jest.fn(),
  };

  const mockRequest = (sub: string) => ({
    user: { sub, roles: [], wallet: 'test-wallet', jti: 'jti', iat: 0, exp: 0 },
  });

  const mockFile = {
    fieldname: 'file',
    originalname: 'avatar.jpg',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from('raw-image'),
  } as Express.Multer.File;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AvatarController],
      providers: [{ provide: AvatarService, useValue: mockAvatarService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AvatarController>(AvatarController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should delegate to AvatarService with the requester id and file', async () => {
    const expected = {
      avatarUrl: 'https://cdn.example.com/original.jpg',
      avatarThumbnailUrl: 'https://cdn.example.com/thumbnail.jpg',
      avatarSmallUrl: 'https://cdn.example.com/small.jpg',
      avatarMediumUrl: 'https://cdn.example.com/medium.jpg',
    };
    mockAvatarService.uploadAvatar.mockResolvedValue(expected);

    const result = await controller.uploadAvatar(
      mockFile,
      mockRequest('user-1') as any,
    );

    expect(result).toEqual(expected);
    expect(mockAvatarService.uploadAvatar).toHaveBeenCalledWith(
      'user-1',
      mockFile,
    );
  });
});
