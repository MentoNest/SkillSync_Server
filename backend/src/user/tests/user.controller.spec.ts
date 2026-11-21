import { UserController } from '../user.controller';

describe('UserController', () => {
  const service = {
    findMe: jest.fn(),
    updateMe: jest.fn(),
    removeMe: jest.fn(),
    findAll: jest.fn(),
  };
  const controller = new UserController(service as any);
  const user = { address: 'GADDR', roles: [], jti: 'j' } as any;

  it('GET users/me delegates to service.findMe', async () => {
    service.findMe.mockResolvedValue({ walletAddress: 'GADDR' });
    await expect(controller.getMe(user)).resolves.toEqual({ walletAddress: 'GADDR' });
    expect(service.findMe).toHaveBeenCalledWith('GADDR');
  });

  it('PATCH users/me delegates to service.updateMe', async () => {
    service.updateMe.mockResolvedValue({ displayName: 'Alice' });
    await expect(controller.updateMe({ displayName: 'Alice' } as any, user)).resolves.toEqual({ displayName: 'Alice' });
    expect(service.updateMe).toHaveBeenCalledWith('GADDR', { displayName: 'Alice' });
  });

  it('DELETE users/me delegates to service.removeMe', async () => {
    service.removeMe.mockResolvedValue(undefined);
    await expect(controller.removeMe(user)).resolves.toBeUndefined();
    expect(service.removeMe).toHaveBeenCalledWith('GADDR');
  });
});
