import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../auth/auth.types';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import type { PaginatedResponse } from '../common/pagination/pagination.interface';
import {
  BookSessionDto,
  CancelSessionDto,
  QuerySessionsDto,
  RateSessionDto,
  RescheduleSessionDto,
} from './dto/session.dto';
import { Session } from './entities/session.entity';
import { SessionsService } from './sessions.service';

@ApiTags('Sessions')
@ApiBearerAuth('Bearer Auth')
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(Role.MENTEE)
  @ApiOperation({
    summary: 'Book a session with a mentor',
    operationId: 'bookSession',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: Session })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, type: ErrorResponseDto })
  book(
    @CurrentUser() user: AuthUser,
    @Body() dto: BookSessionDto,
  ): Promise<Session> {
    return this.sessions.book(user.address, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List session history for the authenticated mentor or mentee',
    operationId: 'listSessions',
  })
  @ApiResponse({ status: HttpStatus.OK })
  history(
    @CurrentUser() user: AuthUser,
    @Query() query: QuerySessionsDto,
  ): Promise<PaginatedResponse<Session>> {
    return this.sessions.history(user.address, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a session by id', operationId: 'getSession' })
  @ApiParam({ name: 'id', description: 'Session UUID' })
  @ApiResponse({ status: HttpStatus.OK, type: Session })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<Session> {
    return this.sessions.findOne(id);
  }

  @Patch(':id/confirm')
  @UseGuards(RolesGuard)
  @Roles(Role.MENTOR)
  @ApiOperation({
    summary: 'Confirm a pending session',
    operationId: 'confirmSession',
  })
  @ApiParam({ name: 'id', description: 'Session UUID' })
  @ApiResponse({ status: HttpStatus.OK, type: Session })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  confirm(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<Session> {
    return this.sessions.confirm(id, user.address);
  }

  @Patch(':id/complete')
  @UseGuards(RolesGuard)
  @Roles(Role.MENTOR)
  @ApiOperation({
    summary: 'Mark a confirmed session completed',
    operationId: 'completeSession',
  })
  @ApiParam({ name: 'id', description: 'Session UUID' })
  @ApiResponse({ status: HttpStatus.OK, type: Session })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  complete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<Session> {
    return this.sessions.complete(id, user.address);
  }

  @Patch(':id/no-show')
  @UseGuards(RolesGuard)
  @Roles(Role.MENTOR)
  @ApiOperation({
    summary: 'Mark a confirmed session as a no-show',
    operationId: 'markSessionNoShow',
  })
  @ApiParam({ name: 'id', description: 'Session UUID' })
  @ApiResponse({ status: HttpStatus.OK, type: Session })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  noShow(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<Session> {
    return this.sessions.markNoShow(id, user.address);
  }

  @Patch(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles(Role.MENTOR, Role.MENTEE, Role.ADMIN)
  @ApiOperation({ summary: 'Cancel a session', operationId: 'cancelSession' })
  @ApiParam({ name: 'id', description: 'Session UUID' })
  @ApiResponse({ status: HttpStatus.OK, type: Session })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelSessionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Session> {
    return this.sessions.cancel(
      id,
      user.address,
      dto.reason,
      user.roles.includes(Role.ADMIN),
    );
  }

  @Patch(':id/reschedule')
  @UseGuards(RolesGuard)
  @Roles(Role.MENTOR, Role.MENTEE, Role.ADMIN)
  @ApiOperation({
    summary: 'Reschedule a session',
    operationId: 'rescheduleSession',
  })
  @ApiParam({ name: 'id', description: 'Session UUID' })
  @ApiResponse({ status: HttpStatus.OK, type: Session })
  @ApiResponse({ status: HttpStatus.CONFLICT, type: ErrorResponseDto })
  reschedule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RescheduleSessionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Session> {
    return this.sessions.reschedule(
      id,
      user.address,
      dto,
      user.roles.includes(Role.ADMIN),
    );
  }

  @Post(':id/rating')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(Role.MENTEE)
  @ApiOperation({
    summary: 'Rate a completed session',
    operationId: 'rateSession',
  })
  @ApiParam({ name: 'id', description: 'Session UUID' })
  @ApiResponse({ status: HttpStatus.CREATED, type: Session })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, type: ErrorResponseDto })
  rate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RateSessionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<Session> {
    return this.sessions.rate(id, user.address, dto.rating, dto.review);
  }
}
