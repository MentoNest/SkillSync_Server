import {
  Controller,
  Post,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RefreshToken } from '../entities/refresh-token.entity';

interface JwtUser {
  sub: string;
}

/**
 * POST /auth/revoke-all
 *
 * Invalidates all active refresh tokens for the authenticated user.
 * Requires a valid Bearer JWT in the Authorization header.
 */
@Controller('auth')
export class RevokeAllSessionsController {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  @Post('revoke-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async revokeAll(
    @Req() req: Request & { user: JwtUser },
  ): Promise<{ revoked: number }> {
    const userId = req.user.sub;
    const now = new Date();

    const result = await this.refreshTokens
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: now })
      .where('userId = :userId AND revokedAt IS NULL', { userId })
      .execute();

    return { revoked: result.affected ?? 0 };
  }
}