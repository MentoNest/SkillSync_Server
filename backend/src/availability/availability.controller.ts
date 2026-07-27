import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AvailabilityService } from './availability.service.js';
import {
  CreateAvailabilitySlotDto,
  UpdateAvailabilitySlotDto,
  CreateAvailabilityExceptionDto,
  UpdateAvailabilityExceptionDto,
} from './dto/availability.dto.js';

/**
 * #995: Availability calendar endpoints.
 *
 * All write endpoints require a valid JWT (mentor owns the resources).
 * Read endpoints for a specific mentor are public.
 */
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  // ── Slots ─────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('slots')
  createSlot(
    @Request() req: { user: { sub: string } },
    @Body() dto: CreateAvailabilitySlotDto,
  ) {
    return this.availabilityService.createSlot(req.user.sub, dto);
  }

  @Get('mentors/:mentorId/slots')
  getSlots(@Param('mentorId', ParseUUIDPipe) mentorId: string) {
    return this.availabilityService.getSlots(mentorId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('slots/:id')
  updateSlot(
    @Request() req: { user: { sub: string } },
    @Param('id', ParseUUIDPipe) slotId: string,
    @Body() dto: UpdateAvailabilitySlotDto,
  ) {
    return this.availabilityService.updateSlot(slotId, req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('slots/:id')
  deleteSlot(
    @Request() req: { user: { sub: string } },
    @Param('id', ParseUUIDPipe) slotId: string,
  ) {
    return this.availabilityService.deleteSlot(slotId, req.user.sub);
  }

  // ── Exceptions ────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('exceptions')
  createException(
    @Request() req: { user: { sub: string } },
    @Body() dto: CreateAvailabilityExceptionDto,
  ) {
    return this.availabilityService.createException(req.user.sub, dto);
  }

  @Get('mentors/:mentorId/exceptions')
  getExceptions(@Param('mentorId', ParseUUIDPipe) mentorId: string) {
    return this.availabilityService.getExceptions(mentorId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('exceptions/:id')
  updateException(
    @Request() req: { user: { sub: string } },
    @Param('id', ParseUUIDPipe) exId: string,
    @Body() dto: UpdateAvailabilityExceptionDto,
  ) {
    return this.availabilityService.updateException(exId, req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('exceptions/:id')
  deleteException(
    @Request() req: { user: { sub: string } },
    @Param('id', ParseUUIDPipe) exId: string,
  ) {
    return this.availabilityService.deleteException(exId, req.user.sub);
  }

  // ── Availability check / upcoming ────────────────────────────────────────

  @Get('mentors/:mentorId/check')
  checkAvailability(
    @Param('mentorId', ParseUUIDPipe) mentorId: string,
    @Query('datetime') datetime: string,
  ) {
    const dt = datetime ? new Date(datetime) : new Date();
    return this.availabilityService.isAvailable(mentorId, dt);
  }

  @Get('mentors/:mentorId/upcoming')
  getUpcoming(
    @Param('mentorId', ParseUUIDPipe) mentorId: string,
    @Query('days') days?: string,
  ) {
    return this.availabilityService.getUpcomingAvailability(
      mentorId,
      days ? parseInt(days, 10) : 30,
    );
  }
}
