import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuditEvent } from '../audit/entities/audit-log.entity';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
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

    const user = await this.users.findOrCreateByWallet({ walletAddress: wallet });
    await this.users.recordLogin(user.id);
    const pair = await this.refresh.issuePair(user, device);
    await this.audit.record({
      event: AuditEvent.LOGIN_SUCCESS,
      userId: user.id,
      walletAddress: wallet,
      ipAddress: device.ipAddress ?? null,
      userAgent: device.userAgent ?? null,
    });
    return pair;
  }

  refreshTokens(refreshToken: string, device: DeviceInfo): Promise<TokenPair> {
    return this.refresh.rotate(refreshToken, device);
  }
}
