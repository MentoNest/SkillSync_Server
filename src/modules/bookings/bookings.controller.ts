import { Controller, Get, Post, Patch, Param, Delete } from '@nestjs/common';
import { BookingsService } from './providers/bookings.service';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  create() {
    return this.bookingsService.create();
  }

  @Get()
  findAll() {
    return this.bookingsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bookingsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string) {
    return this.bookingsService.update(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.bookingsService.remove(+id);
  }
}
