import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AcceptTimezone } from '../common/timezone/accept-timezone.decorator';
import { DEFAULT_TIMEZONE } from '../common/timezone/timezone.util';
import { TimezoneService } from '../common/timezone/timezone.service';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import type { JwtPayload } from '../auth/guards/jwt-auth.guard';
import { RoleName } from '../rbac/roles';
import { AvailabilityService } from './availability.service';
import {
  CreateAvailabilityExceptionDto,
  CreateAvailabilitySlotDto,
  UpdateAvailabilitySlotDto,
} from './dto/availability.dto';

@ApiTags('Availability')
@ApiBearerAuth()
@Controller('mentors/:mentorId/availability')
export class AvailabilityController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly timezones: TimezoneService,
  ) {}

  private assertCanManage(user: JwtPayload, mentorId: string): void {
    if (user?.sub !== mentorId && !user?.roles?.includes(RoleName.ADMIN)) {
      throw new ForbiddenException('You can only manage your own availability');
    }
  }

  @Get()
  list(@Param('mentorId') mentorId: string, @CurrentUser() user: JwtPayload) {
    this.assertCanManage(user, mentorId);
    return this.availability.listSlots(mentorId);
  }

  @Post()
  create(
    @Param('mentorId') mentorId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAvailabilitySlotDto,
  ) {
    this.assertCanManage(user, mentorId);
    return this.availability.createSlot(mentorId, dto);
  }

  @Put(':id')
  update(
    @Param('mentorId') mentorId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateAvailabilitySlotDto,
  ) {
    this.assertCanManage(user, mentorId);
    return this.availability.updateSlot(mentorId, id, dto);
  }

  @Delete(':id')
  async remove(
    @Param('mentorId') mentorId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ deleted: true }> {
    this.assertCanManage(user, mentorId);
    await this.availability.deleteSlot(mentorId, id);
    return { deleted: true };
  }

  @Get('exceptions')
  listExceptions(@Param('mentorId') mentorId: string, @CurrentUser() user: JwtPayload) {
    this.assertCanManage(user, mentorId);
    return this.availability.listExceptions(mentorId);
  }

  @Post('exceptions')
  createException(
    @Param('mentorId') mentorId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAvailabilityExceptionDto,
  ) {
    this.assertCanManage(user, mentorId);
    return this.availability.createException(mentorId, dto);
  }

  @Delete('exceptions/:id')
  async deleteException(
    @Param('mentorId') mentorId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ deleted: true }> {
    this.assertCanManage(user, mentorId);
    await this.availability.deleteException(mentorId, id);
    return { deleted: true };
  }

  /** Concrete occurrences for the next `days` (default 30), shown in the caller's timezone. */
  @Get('available-slots')
  async availableSlots(
    @Param('mentorId') mentorId: string,
    @Query('days') days: string | undefined,
    @CurrentUser('sub') userId: string,
    @AcceptTimezone() acceptTimezone: string,
  ) {
    const parsed = parseInt(days ?? '30', 10);
    const window = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 90) : 30;
    const timezone =
      acceptTimezone && acceptTimezone !== DEFAULT_TIMEZONE
        ? acceptTimezone
        : await this.timezones.getUserTimezone(userId);
    return {
      timezone,
      days: window,
      slots: await this.availability.slotsForNextDays(mentorId, window, timezone),
    };
  }
}
