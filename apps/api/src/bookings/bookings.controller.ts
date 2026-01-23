import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookingResponseDto } from './dto/booking-response.dto';

interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    email: string;
  };
}

@ApiTags('Bookings')
@Controller('bookings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Request a new booking with a mentor' })
  @ApiResponse({
    status: 201,
    description: 'The booking has been successfully requested.',
    type: BookingResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid time or not available.' })
  @ApiResponse({ status: 404, description: 'Mentor not found.' })
  @ApiResponse({ status: 409, description: 'Conflict with existing booking.' })
  create(
    @Body() createBookingDto: CreateBookingDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.sub;
    return this.bookingsService.createBooking(createBookingDto, userId);
  }

  @Get('mentee')
  @ApiOperation({ summary: 'Get all bookings for the current user as mentee' })
  @ApiResponse({
    status: 200,
    description: 'List of bookings.',
    type: [BookingResponseDto],
  })
  getMenteeBookings(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    return this.bookingsService.getMenteeBookings(userId);
  }

  @Get('mentor')
  @ApiOperation({ summary: 'Get all bookings for the current user as mentor' })
  @ApiResponse({
    status: 200,
    description: 'List of bookings.',
    type: [BookingResponseDto],
  })
  getMentorBookings(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    return this.bookingsService.getMentorBookings(userId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update booking status (Mentor only)' })
  @ApiResponse({
    status: 200,
    description: 'The booking status has been updated.',
    type: BookingResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Only mentor can update status.' })
  updateStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateBookingStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.sub;
    return this.bookingsService.updateStatus(id, updateDto.status, userId);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a booking (Mentee or Mentor)' })
  @ApiResponse({
    status: 200,
    description: 'The booking has been cancelled.',
    type: BookingResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Not authorized to cancel.' })
  cancel(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    return this.bookingsService.cancelBooking(id, userId);
  }
}
