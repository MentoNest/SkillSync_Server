import { BadRequestException } from '@nestjs/common';
import { UserController } from '../user.controller';

describe('UserController', () => {
  const service = {
    findMe: jest.fn(),
    updateMe: jest.fn(),
    removeMe: jest.fn(),
    findAll: jest.fn(),
    setStatus: jest.fn(),
  };
  const avatarService = {
    uploadAvatar: jest.fn(),
  };
  const controller = new UserController(service as any, avatarService as any);
  const user = { address: 'GADDR', roles: [], jti: 'j' } as any;

  it('GET users/me delegates to service.findMe', async () => {
    service.findMe.mockResolvedValue({ walletAddress: 'GADDR' });
    await expect(controller.getMe(user)).resolves.toEqual({
      walletAddress: 'GADDR',
      timezone: 'UTC',
    });
    expect(service.findMe).toHaveBeenCalledWith('GADDR');
  });

  it('PATCH users/me delegates to service.updateMe', async () => {
    service.updateMe.mockResolvedValue({ displayName: 'Alice' });
    await expect(
      controller.updateMe({ displayName: 'Alice' } as any, user),
    ).resolves.toEqual({ displayName: 'Alice', timezone: 'UTC' });
    expect(service.updateMe).toHaveBeenCalledWith('GADDR', {
      displayName: 'Alice',
    });
  });

  it('DELETE users/me delegates to service.removeMe', async () => {
    service.removeMe.mockResolvedValue(undefined);
    await expect(controller.removeMe(user)).resolves.toBeUndefined();
    expect(service.removeMe).toHaveBeenCalledWith('GADDR');
  });

  it('POST user/avatar delegates to avatarService.uploadAvatar', async () => {
    const file = {
      mimetype: 'image/png',
      size: 100,
      buffer: Buffer.from('x'),
    } as any;
    avatarService.uploadAvatar.mockResolvedValue({
      avatarUrl: '/uploads/avatars/a.png',
    });
    await expect(controller.uploadAvatar(user, file)).resolves.toEqual({
      avatarUrl: '/uploads/avatars/a.png',
    });
    expect(avatarService.uploadAvatar).toHaveBeenCalledWith('GADDR', file);

    const noAvatarController = new UserController(service as any);
    expect(() => noAvatarController.uploadAvatar(user, file)).toThrow(
      BadRequestException,
    );
  });
});
