import { NotFoundException } from '@nestjs/common';
import { ProfileLookupController } from './profile-lookup.controller';
import { UserStatus } from './entities/user.entity';

describe('ProfileLookupController (#1177)', () => {
  let controller: ProfileLookupController;
  let mockUserService: any;

  beforeEach(() => {
    mockUserService = {
      findByIdIfActive: jest.fn(),
      findByUsername: jest.fn(),
    };
    controller = new ProfileLookupController(mockUserService);
  });

  it('looks up by UUID when the param is a valid UUID', async () => {
    mockUserService.findByIdIfActive.mockResolvedValue({
      id: '123e4567-e89b-12d3-a456-426614174000',
      displayName: 'Alex',
      status: UserStatus.ACTIVE,
      roles: [],
    });

    const result = await controller.getByIdOrUsername('123e4567-e89b-12d3-a456-426614174000');

    expect(mockUserService.findByIdIfActive).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
    expect(mockUserService.findByUsername).not.toHaveBeenCalled();
    expect(result.displayName).toBe('Alex');
  });

  it('looks up by username when the param is not a UUID', async () => {
    mockUserService.findByUsername.mockResolvedValue({
      id: 'uuid-1',
      displayName: 'Alex',
      username: 'alex_rivers',
      status: UserStatus.ACTIVE,
      roles: [],
    });

    const result = await controller.getByIdOrUsername('alex_rivers');

    expect(mockUserService.findByUsername).toHaveBeenCalledWith('alex_rivers');
    expect(result.username).toBe('alex_rivers');
  });

  it('returns 404 when no user is found', async () => {
    mockUserService.findByUsername.mockResolvedValue(null);
    await expect(controller.getByIdOrUsername('nobody')).rejects.toThrow(NotFoundException);
  });

  it('returns 404 for a non-active user (hides deleted/suspended accounts)', async () => {
    mockUserService.findByUsername.mockResolvedValue({
      id: 'uuid-1',
      username: 'gone',
      status: UserStatus.DELETED,
      roles: [],
    });
    await expect(controller.getByIdOrUsername('gone')).rejects.toThrow(NotFoundException);
  });
});
