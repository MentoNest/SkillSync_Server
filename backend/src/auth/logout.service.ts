import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditEvent } from '../audit/entities/audit-log.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { TokenBlacklistService } from './token-blacklist.service';

export interface LogoutContext {
  userId: string;
  jti: string;
  exp: number;
  refreshToken?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class LogoutService {
  constructor(
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    private readonly blacklist: TokenBlacklistService,
    private readonly audit: AuditService,
  ) {}

  /** Blacklists the access token and revokes the supplied refresh token's family. */
  async logout(ctx: LogoutContext): Promise<void> {
    await this.blacklist.blacklist(ctx.jti, ctx.exp);

    if (ctx.refreshToken) {
      const hash = createHash('sha256').update(ctx.refreshToken).digest('hex');
      const row = await this.refreshTokens.findOne({ where: { tokenHash: hash, userId: ctx.userId } });
      if (row) {
        await this.refreshTokens.update({ familyId: row.familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
      }
    }
    await this.audit.record({
      event: AuditEvent.LOGOUT,
      userId: ctx.userId,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }
}
