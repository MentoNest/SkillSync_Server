import { UserResponseDto } from './dto/user-response.dto';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    walletAddress: 'G' + 'A'.repeat(55),
    email: null,
    displayName: null,
    status: 'active',
    avatarUrl: null,
    timezone: null,
    locale: null,
    lastLoginAt: null,
    tokenVersion: 0,
    roles: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

function createController() {
  const users = {
    getOwnProfile: jest.fn(),
    updateOwnProfile: jest.fn(),
    deleteOwnProfile: jest.fn(),
    searchUsers: jest.fn(),
  };
  const controller = new UsersController(users as unknown as UsersService);
  return { controller, users };
}

describe('UsersController', () => {
  it('maps the own profile to a response DTO', async () => {
    const { controller, users } = createController();
    users.getOwnProfile.mockResolvedValue(makeUser({ displayName: 'Alice' }));
    const result = await controller.getOwnProfile({ sub: 'u1' } as never);
    expect(users.getOwnProfile).toHaveBeenCalledWith('u1');
    expect(result).toBeInstanceOf(UserResponseDto);
    expect(result.displayName).toBe('Alice');
    expect(result.roles).toEqual([]);
  });

  it('passes the update payload through to the service', async () => {
    const { controller, users } = createController();
    users.updateOwnProfile.mockResolvedValue(makeUser({ timezone: 'UTC' }));
    const result = await controller.updateOwnProfile({ sub: 'u1' } as never, {
      timezone: 'UTC',
    });
    expect(users.updateOwnProfile).toHaveBeenCalledWith('u1', { timezone: 'UTC' });
    expect(result.timezone).toBe('UTC');
  });

  it('deletes the own profile and reports success', async () => {
    const { controller, users } = createController();
    users.deleteOwnProfile.mockResolvedValue(makeUser({ status: 'deleted' }));
    const result = await controller.deleteOwnProfile({ sub: 'u1' } as never);
    expect(users.deleteOwnProfile).toHaveBeenCalledWith('u1');
    expect(result).toEqual({ success: true, id: 'u1' });
  });

  it('maps the search result to response DTOs', async () => {
    const { controller, users } = createController();
    users.searchUsers.mockResolvedValue({
      items: [makeUser({ displayName: 'Alice' })],
      total: 1,
      page: 1,
      limit: 20,
    });
    const result = await controller.searchUsers({ q: 'alice' });
    expect(users.searchUsers).toHaveBeenCalledWith({ q: 'alice' });
    expect(result.total).toBe(1);
    expect(result.items[0]).toBeInstanceOf(UserResponseDto);
    expect(result.items[0].displayName).toBe('Alice');
  });
});
