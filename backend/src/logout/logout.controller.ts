import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LogoutService } from './logout.service';
import { LogoutAllResponseDto, LogoutDto, LogoutResponseDto } from './dto/logout.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser } from '../user/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { TokenBlacklistService } from '../security/token-blacklist.service';

/**
 * #1317: session termination endpoints.
 *
 * Mounted under the same `/auth` prefix as the login endpoints: the access
 * token being revoked is the credential presented in the `Authorization` header,
 * so logout cannot be an anonymous operation.
 */
@ApiTags('Authentication')
@ApiBearerAuth('Bearer Auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class LogoutController {
  constructor(private readonly logoutService: LogoutService) {}

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out the current session',
    description:
      'Adds the presented access token to the Redis blacklist until it would have expired and deletes the associated refresh token. The access token is rejected with 401 (code `token_revoked`) from the next request onwards, even though it is still cryptographically valid.',
  })
  @ApiBody({ type: LogoutDto, required: false })
  @ApiResponse({ status: HttpStatus.OK, description: 'Logged out', type: LogoutResponseDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing, invalid or already revoked access token',
  })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Internal server error' })
  async logout(
    @CurrentUser() user: User,
    @Body() logoutDto: LogoutDto | undefined,
    @Headers('authorization') authorization?: string,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LogoutResponseDto> {
    return this.logoutService.logout({
      userId: user.id,
      accessToken: TokenBlacklistService.extractBearerToken(authorization),
      refreshToken: logoutDto?.refreshToken,
      walletAddress: user?.walletAddress ?? null,
      ipAddress: ip,
      userAgent,
    });
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out of every device',
    description:
      'Deletes all refresh tokens of the user and increments `tokenVersion`, which invalidates every access token ever issued to the account. Use this after a suspected account compromise or a "sign out everywhere" action.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All sessions terminated',
    type: LogoutAllResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid access token',
  })
  async logoutAll(
    @CurrentUser() user: User,
    @Ip() ip?: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<LogoutAllResponseDto> {
    return this.logoutService.logoutAll({
      userId: user.id,
      walletAddress: user?.walletAddress ?? null,
      ipAddress: ip,
      userAgent,
    });
  }
}
