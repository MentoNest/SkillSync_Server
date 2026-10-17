import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../users/entities/user.entity';
import { LoginDto } from './dto/auth.dto';
import { NonceService } from './nonce.service';
import { DeviceInfo, RefreshTokenService, TokenPair } from './refresh-token.service';
import { SignatureService } from './signature.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly nonces: NonceService,
    private readonly signatures: SignatureService,
    private readonly refresh: RefreshTokenService,
  ) {}

  requestNonce(walletAddress: string) {
    return this.nonces.issue(walletAddress);
  }

  /** Nonce is consumed before the signature is checked, so a failed attempt cannot be retried. */
  async login(dto: LoginDto, device: DeviceInfo): Promise<TokenPair> {
    const wallet = dto.walletAddress.toUpperCase();
    await this.nonces.consume(wallet, dto.nonce);
    this.signatures.verify(wallet, dto.nonce, dto.signature);

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
