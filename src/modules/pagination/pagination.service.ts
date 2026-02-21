import { Injectable } from '@nestjs/common';

@Injectable()
export class PaginationService {
  create() {
    return 'This action adds a new pagination';
  }

  findAll() {
    return `This action returns all pagination`;
  }

  findOne(id: number) {
    return `This action returns a #${id} pagination`;
  }

  update(id: number) {
    return `This action updates a #${id} pagination`;
  }

  remove(id: number) {
    return `This action removes a #${id} pagination`;
  }
}
