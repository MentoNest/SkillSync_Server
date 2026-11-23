import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../auth.types';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from '../guards/roles.guard';
import { InvalidCredentialsException } from '../../common/errors/app-exceptions';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { WalletStrategy } from '../strategies/wallet.strategy';

class AdminController {
  @Roles(Role.ADMIN) adminOnly() {}
  open() {}
}

function ctx(handler: () => void, user?: { roles: Role[] }) {
  return {
    getHandler: () => handler,
    getClass: () => AdminController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const controller = new AdminController();

  it('lets any authenticated user reach routes without @Roles', () => {
    expect(guard.canActivate(ctx(controller.open, { roles: [Role.USER] }))).toBe(true);
  });

  it('allows a user holding a required role', () => {
    expect(guard.canActivate(ctx(controller.adminOnly, { roles: [Role.USER, Role.ADMIN] }))).toBe(true);
  });

  it('forbids users without the role, and requests without a user', () => {
    expect(() => guard.canActivate(ctx(controller.adminOnly, { roles: [Role.USER] }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx(controller.adminOnly))).toThrow(ForbiddenException);
  });
});

describe('JwtStrategy.validate', () => {
  const make = (revoked: boolean) =>
    new JwtStrategy(
      { jwtSecret: 'test-secret-test-secret' } as never,
      {
        isRevoked: () => Promise.resolve(revoked),
        isTokenVersionCurrent: () => Promise.resolve(true),
      } as never,
    );

  it('returns the authenticated user for a live access token', async () => {
    await expect(make(false).validate({ sub: 'GA', roles: [Role.USER], type: 'access', jti: 'j' })).resolves.toEqual({
      address: 'GA', roles: [Role.USER], jti: 'j',
    });
  });

  it('rejects refresh tokens and revoked tokens', async () => {
    await expect(make(false).validate({ sub: 'GA', roles: [], type: 'refresh', jti: 'j' })).rejects.toBeInstanceOf(InvalidCredentialsException);
    await expect(make(true).validate({ sub: 'GA', roles: [], type: 'access', jti: 'j' })).rejects.toBeInstanceOf(InvalidCredentialsException);
  });
});

describe('WalletStrategy.validate', () => {
  const verifyWallet = jest.fn().mockResolvedValue({ address: 'GA', roles: [Role.USER], jti: '' });
  const strategy = new WalletStrategy({ verifyWallet } as never);

  it('verifies the wallet from the request body', async () => {
    await strategy.validate({ body: { address: 'GA', signature: 'c2ln' } } as never);
    expect(verifyWallet).toHaveBeenCalledWith('GA', 'c2ln');
  });

  it('rejects bodies without address and signature strings', async () => {
    await expect(strategy.validate({ body: { address: 1 } } as never)).rejects.toBeInstanceOf(InvalidCredentialsException);
    await expect(strategy.validate({} as never)).rejects.toBeInstanceOf(InvalidCredentialsException);
  });
});
