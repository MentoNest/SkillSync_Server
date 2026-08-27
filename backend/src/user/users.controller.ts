import { Controller, Get, Query, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { UserService } from './user.service';
import { UserSearchQueryDto } from './dto/user-search-query.dto';
import { User } from './entities/user.entity';

/**
 * #1173: Public user directory endpoints.
 */
@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Get()
  @ApiBearerAuth('Bearer Auth')
  @ApiOperation({
    summary: 'Search and filter users by role (#1173)',
    description:
      'Paginated, sortable user search. Supports role filter (mentor, mentee, admin), case-insensitive partial display name search, and mentor skill filter. Returns public profile information only; email/walletAddress are included only when authenticated as admin. Common results are cached in Redis for 1 minute.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated user list with metadata (total, page, limit, totalPages)',
  })
  async searchUsers(@Query() query: UserSearchQueryDto, @Req() request: Request) {
    const isAdmin = await this.isAdminRequest(request);
    return this.userService.searchUsers(query, isAdmin);
  }

  /**
   * Resolves whether the request carries a valid admin JWT.
   * Invalid or missing tokens simply resolve to false (public view).
   */
  private async isAdminRequest(request: Request): Promise<boolean> {
    try {
      const authHeader = request.headers?.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!token) {
        return false;
      }

      const payload: any = this.jwtService.verify(token);
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
        relations: { roles: true },
      });

      if (!user || user.isLocked) {
        return false;
      }
      if (payload.tokenVersion !== undefined && user.tokenVersion !== payload.tokenVersion) {
        return false;
      }

      return Boolean(user.roles?.some((role) => role.name === 'admin'));
    } catch {
      return false;
    }
  }
}
