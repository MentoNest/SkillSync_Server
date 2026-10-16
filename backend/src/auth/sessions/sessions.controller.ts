import { Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { RevokeAllResponseDto } from './dto/revoke-all-response.dto';

interface AuthedRequest {
  user: { sub: string; jti?: string };
}

@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth/sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post('revoke-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke all sessions (log out everywhere)' })
  @ApiOkResponse({ type: RevokeAllResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  revokeAll(@Req() req: AuthedRequest): Promise<RevokeAllResponseDto> {
    return this.sessions.revokeAll(req.user.sub, req.user.jti);
  }
}
