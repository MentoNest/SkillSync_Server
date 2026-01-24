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
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { BookingQueryDto } from './dto/booking-query.dto';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  async createBooking(@Request() req, @Body() createDto: CreateBookingDto) {
    const userId = req.user.id; // From auth guard
    return this.bookingsService.createBooking(userId, createDto);
  }

  @Patch(':id/confirm')
  async confirmBooking(@Request() req, @Param('id') id: string) {
    const userId = req.user.id;
    return this.bookingsService.confirmBooking(id, userId);
  }

  @Patch(':id/cancel')
  async cancelBooking(
    @Request() req,
    @Param('id') id: string,
    @Body('cancellationReason') reason?: string,
  ) {
    const userId = req.user.id;
    return this.bookingsService.cancelBooking(id, userId, reason);
  }

  @Get()
  async getBookings(@Request() req, @Query() query: BookingQueryDto) {
    const userId = req.user.id;
    const userRole = req.user.role; // 'mentee' or 'mentor'
    return this.bookingsService.getBookings(userId, userRole, query);
  }

  @Get(':id')
  async getBookingById(@Request() req, @Param('id') id: string) {
    const userId = req.user.id;
    return this.bookingsService.getBookingById(id, userId);
  }
}
