import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../users/entities/user.entity';
import { LoginDto } from './dto/auth.dto';
import { NonceService } from './nonce.service';
import { DeviceInfo, RefreshTokenService, TokenPair } from './refresh-token.service';
import { NonceService } from './nonce.service';
import { SignatureService } from './signature.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly nonces: NonceService,
    private readonly signatures: SignatureService,
    private readonly refresh: RefreshTokenService,
    private readonly audit: AuditService,
  ) {}

  requestNonce(walletAddress: string) {
    return this.nonces.issue(walletAddress);
  }

  /** Nonce is consumed before the signature is checked, so a failed attempt cannot be retried. */
  async login(dto: LoginDto, device: DeviceInfo): Promise<TokenPair> {
    const wallet = dto.walletAddress.toUpperCase();
    try {
      await this.nonces.consume(wallet, dto.nonce);
      this.signatures.verify(wallet, dto.nonce, dto.signature);
    } catch (err) {
      await this.audit.record({
        event: AuditEvent.LOGIN_FAILURE,
        walletAddress: wallet,
        ipAddress: device.ipAddress ?? null,
        userAgent: device.userAgent ?? null,
        metadata: { reason: (err as Error).message },
      });
      throw err;
    }

    let user = await this.users.findOne({ where: { walletAddress: wallet } });
    if (!user) user = await this.users.save(this.users.create({ walletAddress: wallet }));
    if (user.deletedAt || user.status === UserStatus.DELETED) {
      throw new ForbiddenException(
        'This account has been deleted. Reactivate it via POST /user/account/restore within the grace period.',
      );
    }
    user.lastLoginAt = new Date();
    await this.users.save(user);
    return this.refresh.issuePair(user, device);
  }

  refreshTokens(refreshToken: string, device: DeviceInfo): Promise<TokenPair> {
    return this.refresh.rotate(refreshToken, device);
  }
}
