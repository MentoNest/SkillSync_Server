import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { BookingQueryDto } from './dto/booking-query.dto';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new booking' })
  @ApiResponse({ status: 201, description: 'The booking has been successfully created.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async createBooking(@Request() req, @Body() createDto: CreateBookingDto) {
    const userId = req.user.id; // From auth guard
    return this.bookingsService.createBooking(userId, createDto);
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Confirm a booking' })
  @ApiResponse({ status: 200, description: 'The booking has been confirmed.' })
  @ApiResponse({ status: 404, description: 'Booking not found.' })
  async confirmBooking(@Request() req, @Param('id') id: string) {
    const userId = req.user.id;
    return this.bookingsService.confirmBooking(id, userId);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a booking' })
  @ApiResponse({ status: 200, description: 'The booking has been cancelled.' })
  @ApiResponse({ status: 404, description: 'Booking not found.' })
  async cancelBooking(
    @Request() req,
    @Param('id') id: string,
    @Body('cancellationReason') reason?: string,
  ) {
    const userId = req.user.id;
    return this.bookingsService.cancelBooking(id, userId, reason);
  }

  @Get()
  @ApiOperation({ summary: 'Get all bookings for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Return all bookings.' })
  async getBookings(@Request() req, @Query() query: BookingQueryDto) {
    const userId = req.user.id;
    const userRole = req.user.role; // 'mentee' or 'mentor'
    return this.bookingsService.getBookings(userId, userRole, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a booking by ID' })
  @ApiResponse({ status: 200, description: 'Return the booking.' })
  @ApiResponse({ status: 404, description: 'Booking not found.' })
  async getBookingById(@Request() req, @Param('id') id: string) {
    const userId = req.user.id;
    return this.bookingsService.getBookingById(id, userId);
  }
}
