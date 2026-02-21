import { Injectable } from '@nestjs/common';

@Injectable()
export class BookingsService {
  create() {
    return 'This action adds a new booking';
  }

  findAll() {
    return `This action returns all bookings`;
  }

  findOne(id: number) {
    return `This action returns a #${id} booking`;
  }

  update(id: number) {
    return `This action updates a #${id} booking`;
  }

  remove(id: number) {
    return `This action removes a #${id} booking`;
  }
}
