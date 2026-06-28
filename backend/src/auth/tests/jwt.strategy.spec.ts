import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { JwtAccessTokenPayload } from '../../jwt-payload.interface';

const validPayload: JwtAccessTokenPayload = {
  sub: 'user-1',
  wallet: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
  roles: [],
  permissions: [],
  jti: 'jti-abc',
  ver: 1,
  iat: Math.floor(Date.now() / 1000) - 60,
};

const mockValidateTokenVersion = jest.fn();
const mockAuthService = { validateTokenVersion: mockValidateTokenVersion };

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'JWT_SECRET') return 'test-secret';
    if (key === 'JWT_ALGORITHM') return 'HS256';
    return undefined;
  }),
};

function makeStrategy(): JwtStrategy {
  return new JwtStrategy(mockConfig as any, mockAuthService as any);
}

describe('JwtStrategy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns payload when token version is current', async () => {
    mockValidateTokenVersion.mockResolvedValue(true);
    const strategy = makeStrategy();
    const result = await strategy.validate(validPayload);
    expect(result).toEqual(validPayload);
    expect(mockValidateTokenVersion).toHaveBeenCalledWith(validPayload);
  });

  it('throws 401 when token version is stale', async () => {
    mockValidateTokenVersion.mockResolvedValue(false);
    const strategy = makeStrategy();
    await expect(strategy.validate(validPayload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws 401 when sub is missing', async () => {
    mockValidateTokenVersion.mockResolvedValue(true);
    const strategy = makeStrategy();
    const bad = { ...validPayload, sub: '' };
    await expect(strategy.validate(bad)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws 401 when wallet is missing', async () => {
    mockValidateTokenVersion.mockResolvedValue(true);
    const strategy = makeStrategy();
    const bad = { ...validPayload, wallet: '' };
    await expect(strategy.validate(bad)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws 401 when jti is missing', async () => {
    mockValidateTokenVersion.mockResolvedValue(true);
    const strategy = makeStrategy();
    const bad = { ...validPayload, jti: '' };
    await expect(strategy.validate(bad)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
