import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { User } from '../user.entity';
import { UserStatus } from '../user-status.enum';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserService } from '../user.service';

const WALLET = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';

describe('user timezone preference', () => {
  it('persists the selected IANA timezone and returns it in the profile response', async () => {
    const user = Object.assign(new User(), {
      walletAddress: WALLET,
      email: null,
      username: null,
      displayName: null,
      status: UserStatus.ACTIVE,
      avatarUrl: null,
      timezone: 'UTC',
      locale: 'en',
      usernameChangedAt: null,
      lastLoginAt: null,
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const users = {
      findOneBy: jest.fn().mockResolvedValue(user),
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn().mockResolvedValue(user),
    };
    const completeness = {
      invalidate: jest.fn().mockResolvedValue(undefined),
      getForUser: jest.fn().mockResolvedValue({ score: 80 }),
    };
    const service = new UserService(
      users as never,
      { listByWallet: jest.fn().mockResolvedValue([]) } as never,
      completeness as never,
    );

    const response = await service.updateMe(WALLET, {
      timezone: 'America/New_York',
    });

    expect(user.timezone).toBe('America/New_York');
    expect(response.timezone).toBe('America/New_York');
    expect(response.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('defaults newly created users to UTC', async () => {
    const users = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((data: Partial<User>) =>
        Object.assign(new User(), {
          ...data,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ),
      save: jest.fn((user: User) => Promise.resolve(user)),
    };
    const service = new UserService(
      users as never,
      { listByWallet: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
    );
    const dto = plainToInstance(CreateUserDto, { walletAddress: WALLET });

    await expect(service.create(dto)).resolves.toMatchObject({
      timezone: 'UTC',
    });
  });

  it('rejects invalid timezone preferences', async () => {
    const dto = plainToInstance(UpdateUserDto, { timezone: 'Mars/Olympus' });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('timezone');
  });
});
