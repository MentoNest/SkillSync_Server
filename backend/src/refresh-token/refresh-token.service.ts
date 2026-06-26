import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../auth.service';

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private authService: AuthService,
  ) {}

  async createRefreshToken(
    user: User,
    jti: string,
    deviceFingerprint?: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<RefreshToken> {
    const expiresIn = this.configService.get('JWT_REFRESH_EXPIRATION', '7d');
    const expiresAt = new Date();
    
    // Parse expiration (e.g., "7d" -> 7 days)
    const days = parseInt(expiresIn);
    const milliseconds = days * 24 * 60 * 60 * 1000;
    expiresAt.setTime(expiresAt.getTime() + milliseconds);

    // Hash the token for storage
    const tokenHash = await this.hashToken(jti);

    const refreshToken = this.refreshTokenRepository.create({
      userId: user.id,
      user,
      token: tokenHash,
      jti,
      deviceFingerprint,
      userAgent,
      ipAddress,
      expiresAt,
      isActive: true,
    });

    return this.refreshTokenRepository.save(refreshToken);
  }

  async validateRefreshToken(token: string): Promise<RefreshToken> {
    const tokenHash = await this.hashToken(token);
    
    const refreshToken = await this.refreshTokenRepository.findOne({
      where: { token: tokenHash, isActive: true },
      relations: { user: true },
    });

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (refreshToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    return refreshToken;
  }

  async revokeRefreshToken(tokenId: string, reason?: string): Promise<void> {
    await this.refreshTokenRepository.update(tokenId, {
      isActive: false,
      revokedAt: new Date(),
      revokedReason: reason || 'Revoked',
    });
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId },
      {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: 'All tokens revoked',
      },
    );
  }

  async rotateRefreshToken(
    oldToken: string,
    user: User,
    deviceFingerprint?: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ newRefreshToken: RefreshToken; oldTokenId: string }> {
    const oldRefreshToken = await this.validateRefreshToken(oldToken);
    
    // Check for concurrent refresh (multiple uses of same token)
    if (oldRefreshToken.replacedByTokenId) {
      // Token was already used - possible token theft
      await this.revokeAllUserTokens(user.id);
      throw new UnauthorizedException('Refresh token already used - possible token theft detected');
    }

    // Generate new token
    const jti = uuidv4();
    const newRefreshToken = await this.createRefreshToken(
      user,
      jti,
      deviceFingerprint,
      userAgent,
      ipAddress,
    );

    // Invalidate old token and link to new one
    await this.refreshTokenRepository.update(oldRefreshToken.id, {
      isActive: false,
      revokedAt: new Date(),
      revokedReason: 'Rotated',
      replacedByTokenId: newRefreshToken.id,
    });

    return {
      newRefreshToken,
      oldTokenId: oldRefreshToken.id,
    };
  }

  private async hashToken(token: string): Promise<string> {
    // Simple hashing - in production use bcrypt or similar
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async cleanupExpiredTokens(): Promise<void> {
    await this.refreshTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
  }

  async getTokenByJti(jti: string): Promise<RefreshToken | null> {
    return this.refreshTokenRepository.findOne({
      where: { jti },
      relations: { user: true },
    });
  }
}