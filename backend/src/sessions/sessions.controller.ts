import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import type { JwtPayload } from '../auth/guards/jwt-auth.guard';
import { RoleName } from '../rbac/roles';
import { BookSessionDto, CancelSessionDto, QuerySessionsDto, RateSessionDto } from './dto/session.dto';
import { SessionsService } from './sessions.service';

@ApiTags('Sessions')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  book(@CurrentUser('sub') menteeId: string, @Body() dto: BookSessionDto) {
    return this.sessions.book(menteeId, dto);
  }

  @Get()
  history(@CurrentUser('sub') userId: string, @Query() query: QuerySessionsDto) {
    return this.sessions.history(userId, query);
  }

  @Patch(':id/confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('sub') userId: string) {
    return this.sessions.confirm(id, userId);
  }

  @Patch(':id/complete')
  complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('sub') userId: string) {
    return this.sessions.complete(id, userId);
  }

  @Patch(':id/no-show')
  noShow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('sub') userId: string) {
    return this.sessions.markNoShow(id, userId);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CancelSessionDto,
  ) {
    return this.sessions.cancel(id, user.sub, dto.reason, user.roles?.includes(RoleName.ADMIN) ?? false);
  }

  @Post(':id/rating')
  rate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') menteeId: string,
    @Body() dto: RateSessionDto,
  ) {
    return this.sessions.rate(id, menteeId, dto.rating, dto.review);
  }
}
