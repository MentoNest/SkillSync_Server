import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

// @Global makes this module's exports available app-wide, so feature modules
// can use JwtAuthGuard without importing AuthGuardsModule themselves.
@Global()
@Module({
  imports: [
    // registerAsync lets the secret come from ConfigService at startup
    // instead of being hardcoded.
    JwtModule.registerAsync({
      inject: [ConfigService],
      // getOrThrow fails fast at boot if JWT_SECRET is missing, rather than
      // silently running with an undefined secret.
      // NOTE: no signOptions (e.g. expiresIn) are set here, so token expiry
      // must be set wherever tokens are signed.
      useFactory: (c: ConfigService) => ({ secret: c.getOrThrow<string>('JWT_SECRET') }),
    }),
  ],
  // The guard protects routes; the strategy (Passport) verifies incoming JWTs
  providers: [JwtAuthGuard, JwtStrategy],
  // JwtModule is re-exported so other modules can inject JwtService
  // (e.g. to sign tokens at login) with the same configuration.
  exports: [JwtAuthGuard, JwtStrategy, JwtModule],
})
export class AuthGuardsModule {}