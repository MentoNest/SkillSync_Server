import { Injectable } from '@nestjs/common';

@Injectable()
export class PaymentsService {
  create() {
    return 'This action adds a new payment';
  }

  findAll() {
    return `This action returns all payments`;
  }

  findOne(id: number) {
    return `This action returns a #${id} payment`;
  }

  update(id: number) {
    return `This action updates a #${id} payment`;
  }

  remove(id: number) {
    return `This action removes a #${id} payment`;
  }
}
