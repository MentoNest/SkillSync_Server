import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../auth/auth.types';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AvailabilityCheckQueryDto,
  MentorIdParamDto,
} from '../common/dto/base.dto';
import { resolveTimezone } from '../common/utils/timezone.utils';
import {
  ErrorResponseDto,
  ForbiddenResponseDto,
  UnauthorizedResponseDto,
} from '../common/dto/error-response.dto';
import { AvailabilityException } from './availability-exception.entity';
import { AvailabilitySlot } from './availability-slot.entity';
import { AvailabilityService } from './availability.service';
import {
  CreateAvailabilityExceptionDto,
  UpdateAvailabilityExceptionDto,
} from './dto/availability-exception.dto';
import {
  AvailabilityCheckResponseDto,
  Next30DaysAvailabilityResponseDto,
} from './dto/availability-response.dto';
import {
  CreateAvailabilitySlotDto,
  UpdateAvailabilitySlotDto,
} from './dto/availability-slot.dto';

@ApiTags('Availability')
@Controller()
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  // ─── Mentor-owned slot CRUD ───────────────────────────────────────────────

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MENTOR)
  @Get('mentors/me/availability/slots')
  @ApiOperation({
    summary: 'List my weekly availability slots',
    operationId: 'listMyAvailabilitySlots',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [AvailabilitySlot] })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ForbiddenResponseDto })
  listMySlots(@CurrentUser() user: AuthUser): Promise<AvailabilitySlot[]> {
    return this.availabilityService.listSlots(user.address);
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MENTOR)
  @Post('mentors/me/availability/slots')
  @ApiOperation({
    summary: 'Create a weekly availability slot',
    operationId: 'createAvailabilitySlot',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: AvailabilitySlot })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ForbiddenResponseDto })
  createSlot(
    @Body() dto: CreateAvailabilitySlotDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AvailabilitySlot> {
    return this.availabilityService.createSlot(user.address, dto);
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MENTOR)
  @Put('mentors/me/availability/slots/:id')
  @ApiOperation({
    summary: 'Update a weekly availability slot',
    operationId: 'updateAvailabilitySlot',
  })
  @ApiParam({ name: 'id', description: 'Availability slot UUID' })
  @ApiResponse({ status: HttpStatus.OK, type: AvailabilitySlot })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  updateSlot(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAvailabilitySlotDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AvailabilitySlot> {
    return this.availabilityService.updateSlot(user.address, id, dto);
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MENTOR)
  @Delete('mentors/me/availability/slots/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a weekly availability slot',
    operationId: 'deleteAvailabilitySlot',
  })
  @ApiParam({ name: 'id', description: 'Availability slot UUID' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Deleted.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  async deleteSlot(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.availabilityService.deleteSlot(user.address, id);
  }

  // ─── Mentor-owned exception CRUD ──────────────────────────────────────────

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MENTOR)
  @Get('mentors/me/availability/exceptions')
  @ApiOperation({
    summary: 'List my availability exceptions',
    operationId: 'listMyAvailabilityExceptions',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [AvailabilityException] })
  listMyExceptions(
    @CurrentUser() user: AuthUser,
  ): Promise<AvailabilityException[]> {
    return this.availabilityService.listExceptions(user.address);
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MENTOR)
  @Post('mentors/me/availability/exceptions')
  @ApiOperation({
    summary: 'Create an availability exception',
    operationId: 'createAvailabilityException',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: AvailabilityException })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  createException(
    @Body() dto: CreateAvailabilityExceptionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AvailabilityException> {
    return this.availabilityService.createException(user.address, dto);
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MENTOR)
  @Put('mentors/me/availability/exceptions/:id')
  @ApiOperation({
    summary: 'Update an availability exception',
    operationId: 'updateAvailabilityException',
  })
  @ApiParam({ name: 'id', description: 'Availability exception UUID' })
  @ApiResponse({ status: HttpStatus.OK, type: AvailabilityException })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  updateException(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAvailabilityExceptionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AvailabilityException> {
    return this.availabilityService.updateException(user.address, id, dto);
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MENTOR)
  @Delete('mentors/me/availability/exceptions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an availability exception',
    operationId: 'deleteAvailabilityException',
  })
  @ApiParam({ name: 'id', description: 'Availability exception UUID' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Deleted.' })
  async deleteException(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.availabilityService.deleteException(user.address, id);
  }

  // ─── Public reads ─────────────────────────────────────────────────────────

  @Get('mentors/:mentorId/availability/slots')
  @ApiOperation({
    summary: 'List a mentor weekly availability slots',
    operationId: 'listMentorAvailabilitySlots',
  })
  @ApiParam({ name: 'mentorId', description: 'Mentor wallet address' })
  @ApiResponse({ status: HttpStatus.OK, type: [AvailabilitySlot] })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  listMentorSlots(
    @Param() params: MentorIdParamDto,
  ): Promise<AvailabilitySlot[]> {
    return this.availabilityService.listSlots(params.mentorId);
  }

  @Get('mentors/:mentorId/availability/exceptions')
  @ApiOperation({
    summary: 'List a mentor availability exceptions',
    operationId: 'listMentorAvailabilityExceptions',
  })
  @ApiParam({ name: 'mentorId', description: 'Mentor wallet address' })
  @ApiResponse({ status: HttpStatus.OK, type: [AvailabilityException] })
  listMentorExceptions(
    @Param() params: MentorIdParamDto,
  ): Promise<AvailabilityException[]> {
    return this.availabilityService.listExceptions(params.mentorId);
  }

  @Get('mentors/:mentorId/availability/check')
  @ApiHeader({
    name: 'Accept-Timezone',
    required: false,
    description: 'IANA timezone override for this response.',
  })
  @ApiOperation({
    summary: 'Check if mentor is available at a datetime',
    description:
      'dateTime must be an ISO 8601 datetime. Availability is evaluated in UTC.',
    operationId: 'checkMentorAvailability',
  })
  @ApiParam({ name: 'mentorId', description: 'Mentor wallet address' })
  @ApiQuery({
    name: 'dateTime',
    required: true,
    example: '2026-11-23T10:30:00.000Z',
  })
  @ApiResponse({ status: HttpStatus.OK, type: AvailabilityCheckResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  checkAvailability(
    @Param() params: MentorIdParamDto,
    @Query() query: AvailabilityCheckQueryDto,
    @Headers('accept-timezone') timezone?: string,
  ): Promise<AvailabilityCheckResponseDto> {
    return this.availabilityService.isAvailable(
      params.mentorId,
      query.dateTime,
      resolveTimezone('UTC', timezone),
    );
  }

  @Get('mentors/:mentorId/availability/next-30-days')
  @ApiHeader({
    name: 'Accept-Timezone',
    required: false,
    description: 'IANA timezone override for display fields.',
  })
  @ApiOperation({
    summary: 'Get available windows for the next 30 days',
    description:
      'Returns concrete available UTC windows derived from weekly slots minus unavailable exceptions. ' +
      'Display times use the mentor timezone preference unless Accept-Timezone overrides it.',
    operationId: 'getMentorNext30DaysAvailability',
  })
  @ApiParam({ name: 'mentorId', description: 'Mentor wallet address' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: Next30DaysAvailabilityResponseDto,
  })
  getNext30Days(
    @Param() params: MentorIdParamDto,
    @Headers('accept-timezone') timezone?: string,
  ): Promise<Next30DaysAvailabilityResponseDto> {
    return this.availabilityService.getNext30DaysAvailability(
      params.mentorId,
      undefined,
      timezone ? resolveTimezone('UTC', timezone) : undefined,
    );
  }
}
