import {
  Body,
  Controller,
  Delete,
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
import { AvailabilityService } from './availability.service';
import {
  BlockTimeDto,
  CreateAvailabilityDto,
  QueryRangeDto,
  QuerySlotsDto,
  UpdateAvailabilityDto,
} from './dto/availability.dto';
import { MentorAvailability } from './entities/mentor-availability.entity';
import { BlockedTime } from './entities/blocked-time.entity';
import { AvailableSlot, MentorSchedule } from './interfaces/availability.interfaces';

/**
 * AvailabilityController
 *
 * Two route namespaces:
 *   /availability/rules      → mentor manages their own recurring schedules
 *   /availability/blocked    → mentor manages one-off unavailability blocks
 *   /availability/slots      → public/booking endpoint to query open slots
 *
 * Auth is left as TODO stubs — wire in your existing JwtAuthGuard / RolesGuard.
 */
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  // ─── Availability Rules ──────────────────────────────────────────────────

  /**
   * POST /availability/rules
   * Create a new recurring availability rule for a mentor.
   */
  @Post('rules')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(Role.MENTOR)
  async createRule(
    @Body() dto: CreateAvailabilityDto,
    // @CurrentUser() user: AuthUser,  ← inject from JWT when wired
  ): Promise<MentorAvailability> {
    // Replace 'MENTOR_ID_PLACEHOLDER' with user.id from your auth guard
    const mentorId = 'MENTOR_ID_PLACEHOLDER';
    return this.availabilityService.createRule(mentorId, dto);
  }

  /**
   * GET /availability/rules
   * List all recurring rules for the authenticated mentor.
   */
  @Get('rules')
  async getRules(): Promise<MentorAvailability[]> {
    const mentorId = 'MENTOR_ID_PLACEHOLDER';
    return this.availabilityService.getRules(mentorId);
  }

  /**
   * GET /availability/rules/:id
   * Fetch a single rule by ID.
   */
  @Get('rules/:id')
  async getRule(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MentorAvailability> {
    const mentorId = 'MENTOR_ID_PLACEHOLDER';
    return this.availabilityService.getRule(id, mentorId);
  }

  /**
   * PATCH /availability/rules/:id
   * Partially update an existing rule.
   */
  @Patch('rules/:id')
  async updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAvailabilityDto,
  ): Promise<MentorAvailability> {
    const mentorId = 'MENTOR_ID_PLACEHOLDER';
    return this.availabilityService.updateRule(id, mentorId, dto);
  }

  /**
   * DELETE /availability/rules/:id
   * Hard-delete an availability rule.
   */
  @Delete('rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRule(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const mentorId = 'MENTOR_ID_PLACEHOLDER';
    return this.availabilityService.deleteRule(id, mentorId);
  }

  // ─── Blocked Times ────────────────────────────────────────────────────────

  /**
   * POST /availability/blocked
   * Block a specific date/time range (e.g. vacation, sick day).
   */
  @Post('blocked')
  async blockTime(@Body() dto: BlockTimeDto): Promise<BlockedTime> {
    const mentorId = 'MENTOR_ID_PLACEHOLDER';
    return this.availabilityService.blockTime(mentorId, dto);
  }

  /**
   * GET /availability/blocked
   * List all blocked periods for the authenticated mentor.
   */
  @Get('blocked')
  async getBlockedTimes(): Promise<BlockedTime[]> {
    const mentorId = 'MENTOR_ID_PLACEHOLDER';
    return this.availabilityService.getBlockedTimes(mentorId);
  }

  /**
   * DELETE /availability/blocked/:id
   * Remove a blocked period.
   */
  @Delete('blocked/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeBlock(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const mentorId = 'MENTOR_ID_PLACEHOLDER';
    return this.availabilityService.removeBlock(id, mentorId);
  }

  // ─── Slot Queries (Booking Integration) ──────────────────────────────────

  /**
   * GET /availability/:mentorId/slots?date=YYYY-MM-DD&durationMinutes=60
   * Returns all open bookable slots for a mentor on a given date.
   *
   * Public endpoint — accessible by mentees during booking flow.
   * The Booking module should inject booked windows via the service directly.
   */
  @Get(':mentorId/slots')
  async getAvailableSlots(
    @Param('mentorId', ParseUUIDPipe) mentorId: string,
    @Query() dto: QuerySlotsDto,
  ): Promise<AvailableSlot[]> {
    return this.availabilityService.getAvailableSlots(mentorId, dto);
  }

  /**
   * GET /availability/:mentorId/slots/range?from=YYYY-MM-DD&to=YYYY-MM-DD
   * Returns the full schedule (grouped by date) across a date range.
   * Used to power calendar/scheduler views on the frontend.
   */
  @Get(':mentorId/slots/range')
  async getAvailableSlotsRange(
    @Param('mentorId', ParseUUIDPipe) mentorId: string,
    @Query() dto: QueryRangeDto,
  ): Promise<MentorSchedule[]> {
    return this.availabilityService.getAvailableSlotsRange(mentorId, dto);
  }
}
