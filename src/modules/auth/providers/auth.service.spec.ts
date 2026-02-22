import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService register', () => {
  let authService: AuthService;
  let userServiceMock: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
  };
  let mailServiceMock: {
    sendWelcomeEmail: jest.Mock;
    sendLoginEmail: jest.Mock;
  };
  let cacheServiceMock: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
  };
  let auditServiceMock: {
    recordTokenReuseAttempt: jest.Mock;
  };

  beforeEach(() => {
    userServiceMock = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };

    mailServiceMock = {
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
      sendLoginEmail: jest.fn().mockResolvedValue(undefined),
    };

    cacheServiceMock = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    };

    auditServiceMock = {
      recordTokenReuseAttempt: jest.fn(),
    };

    const nonceServiceMock = {
      storeNonce: jest.fn(),
    };

    const configServiceMock = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const values: Record<string, string> = {
          JWT_EXPIRES_IN: '1h',
          JWT_SECRET: 'secret',
          JWT_REFRESH_SECRET: 'refresh-secret',
          JWT_REFRESH_EXPIRES_IN: '7d',
        };

        return values[key] ?? defaultValue;
      }),
    };

    const jwtServiceMock = {
      sign: jest.fn(),
    };

    const stellarNonceServiceMock = {
      consume: jest.fn(),
    };

    authService = new AuthService(
      nonceServiceMock as any,
      configServiceMock as any,
      cacheServiceMock as any,
      userServiceMock as any,
      mailServiceMock as any,
      jwtServiceMock as any,
      stellarNonceServiceMock as any,
      auditServiceMock as any,
    );
  });

  it('creates a new user and sends welcome email', async () => {
    userServiceMock.findByEmail.mockResolvedValue(null);

    const user = {
      id: '1',
      email: 'test@example.com',
      password: 'hashedpassword',
      firstName: 'John',
      lastName: 'Doe',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    userServiceMock.create.mockResolvedValue(user);

    const result = await authService.register({
      firstName: 'John',
      lastName: 'Doe',
      email: 'test@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    } as any);

    expect(userServiceMock.findByEmail).toHaveBeenCalledWith('test@example.com');
    expect(userServiceMock.create).toHaveBeenCalled();
    expect(mailServiceMock.sendWelcomeEmail).toHaveBeenCalled();
    expect((result.user as any).password).toBeUndefined();
  });

  it('throws ConflictException when user already exists', async () => {
    const existingUser = {
      id: '1',
      email: 'test@example.com',
      password: 'hashedpassword',
      firstName: 'John',
      lastName: 'Doe',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    userServiceMock.findByEmail.mockResolvedValue(existingUser);

    await expect(
      authService.register({
        firstName: 'John',
        lastName: 'Doe',
        email: 'test@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
