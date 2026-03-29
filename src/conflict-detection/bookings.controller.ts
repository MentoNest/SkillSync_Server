import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { BookingConflictGuard } from './guards/booking-conflict.guard';
import { BookingConflictService } from './booking-conflict.service';
import { SkipConflictCheck } from './decorators/skip-conflict-check.decorator';
import { ConflictBuffer } from './decorators/conflict-buffer.decorator';
import {
  CreateBookingDto,
  CheckConflictDto,
  ConflictResponseDto,
} from './dto/booking.dto';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly conflictService: BookingConflictService) {}

  // ─── Conflict Probe (pre-flight) ──────────────────────────────────────────

  @Post('check-conflict')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check if a time slot has conflicts (non-throwing)',
    description:
      'Returns a full conflict report without booking anything. ' +
      'Use this for real-time availability feedback in the UI.',
  })
  @ApiResponse({ status: 200, type: ConflictResponseDto })
  async checkConflict(
    @Body() dto: CheckConflictDto,
  ): Promise<ConflictResponseDto> {
    return this.conflictService.detectConflicts(dto);
  }

  // ─── Availability Calendar ─────────────────────────────────────────────────

  @Get(':listingId/available-slots')
  @ApiOperation({
    summary: 'Get available time slots for a listing on a given date',
  })
  @ApiQuery({ name: 'date', example: '2025-06-01' })
  @ApiQuery({ name: 'slotDuration', example: 60, required: false })
  async getAvailableSlots(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Query('date') date: string,
    @Query('slotDuration', new DefaultValuePipe(60), ParseIntPipe)
    slotDurationMinutes: number,
  ): Promise<{ slots: Array<{ startTime: Date; endTime: Date }> }> {
    const slots = await this.conflictService.getAvailableSlots(
      listingId,
      new Date(date),
      slotDurationMinutes,
    );
    return { slots };
  }

  // ─── Create Booking (with guard) ──────────────────────────────────────────

  @Post()
  @UseGuards(BookingConflictGuard)
  @ApiOperation({
    summary: 'Create a booking — automatically blocks conflicting slots',
  })
  @ApiResponse({ status: 201, description: 'Booking created' })
  @ApiResponse({ status: 409, description: 'Slot conflict detected' })
  async createBooking(@Body() dto: CreateBookingDto) {
    // After guard passes, persist the booking here via BookingsService
    // Return placeholder until wired to full BookingsService
    return {
      message: 'Booking accepted — no conflicts detected.',
      slot: { listingId: dto.listingId, start: dto.startTime, end: dto.endTime },
    };
  }

  // ─── Reschedule (conflict guard excludes current booking) ─────────────────

  @Patch(':id/reschedule')
  @UseGuards(BookingConflictGuard)
  @ApiOperation({
    summary: 'Reschedule a booking — conflicts checked, current slot excluded',
  })
  async rescheduleBooking(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBookingDto,
  ) {
    // dto.excludeBookingId should be set by caller to `id`
    return {
      message: 'Reschedule accepted — no conflicts.',
      bookingId: id,
      slot: { start: dto.startTime, end: dto.endTime },
    };
  }

  // ─── Admin force-create (bypasses conflict check) ─────────────────────────

  @Post('admin/force')
  @SkipConflictCheck()
  @ApiOperation({
    summary: '[Admin] Force-create a booking ignoring conflicts',
  })
  async forceCreate(@Body() dto: CreateBookingDto) {
    return {
      message: 'Booking force-created (conflict check bypassed).',
      slot: { listingId: dto.listingId, start: dto.startTime, end: dto.endTime },
    };
  }

  // ─── Premium listing with 15-min buffer ───────────────────────────────────

  @Post('premium')
  @ConflictBuffer(15)
  @UseGuards(BookingConflictGuard)
  @ApiOperation({
    summary: 'Book a premium listing (enforces 15-min gap between sessions)',
  })
  async createPremiumBooking(@Body() dto: CreateBookingDto) {
    return {
      message: 'Premium booking accepted (15-min buffer enforced).',
      slot: { listingId: dto.listingId, start: dto.startTime, end: dto.endTime },
    };
  }
}
