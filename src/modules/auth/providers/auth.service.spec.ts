import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService register', () => {
  let authService: AuthService;
  let userServiceMock: {
    findByEmail: jest.Mock;
    create: jest.Mock;
  };
  let mailServiceMock: {
    sendWelcomeEmail: jest.Mock;
    sendLoginEmail: jest.Mock;
  };

  beforeEach(() => {
    userServiceMock = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    };

    mailServiceMock = {
      sendWelcomeEmail: jest.fn(),
      sendLoginEmail: jest.fn(),
    };

    const nonceServiceMock = {
      storeNonce: jest.fn(),
    };

    const configServiceMock = {
      jwtExpiresIn: '1h',
      jwtSecret: 'secret',
    };

    const jwtServiceMock = {
      sign: jest.fn(),
    };

    authService = new AuthService(
      nonceServiceMock as any,
      configServiceMock as any,
      userServiceMock as any,
      mailServiceMock as any,
      jwtServiceMock as any,
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

    expect(userServiceMock.findByEmail).toHaveBeenCalledWith(
      'test@example.com',
    );
    expect(userServiceMock.create).toHaveBeenCalled();
    expect(mailServiceMock.sendWelcomeEmail).toHaveBeenCalledWith(
      'test@example.com',
      'John',
    );
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
