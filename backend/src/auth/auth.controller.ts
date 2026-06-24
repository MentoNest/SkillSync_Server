import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { AccountId, Keypair, StrKey, TransactionBuilder, BASE_FEE, Networks } from 'stellar-sdk';
import { LoginDto } from './login.dto';
import { AuthService } from './auth.service';
import { RedisService } from '../redis/redis.service';
import { UserService } from './user.service';
import { LoginAttemptService } from './login-attempt.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly redisService: RedisService,
    private readonly userService: UserService,
    private readonly loginAttemptService: LoginAttemptService,
  ) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const attemptCount = await this.loginAttemptService.incrementAttempts(dto.wallet);
    if (attemptCount > 10) {
      throw new HttpException('Too many login attempts', HttpStatus.TOO_MANY_REQUESTS);
    }

    const nonceKey = `nonce:${dto.wallet}`;
    const storedNonce = await this.redisService.get(dto.wallet, 'nonce');
    if (!storedNonce) {
      await this.deleteNonce(dto.wallet);
      throw new HttpException('Nonce expired or invalid', HttpStatus.UNAUTHORIZED);
    }

    const valid = this.verifySignature(dto.wallet, dto.signature, storedNonce, dto.network);
    await this.deleteNonce(dto.wallet);

    if (!valid) {
      throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.userService.findOrCreateByWallet(dto.wallet);
    const accessToken = await this.authService.issueAccessToken(user.id, user.wallet, user.roles, user.permissions);
    const refreshToken = await this.authService.issueRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        wallet: user.wallet,
        roles: user.roles,
        permissions: user.permissions,
      },
    };
  }

  private deleteNonce(wallet: string) {
    return this.redisService.del(wallet, 'nonce');
  }

  private verifySignature(wallet: string, signature: string, nonce: string, network: string) {
    const networkPassphrase = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
    const keypair = Keypair.fromPublicKey(wallet);
    const payload = Buffer.from(nonce, 'hex');

    try {
      return keypair.verify(payload, Buffer.from(signature, 'base64'));
    } catch (error) {
      return false;
    }
  }
}
