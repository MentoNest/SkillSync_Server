import { Injectable } from '@nestjs/common';
import { CreatePaginationDto } from './dto/create-pagination.dto';
import { UpdatePaginationDto } from './dto/update-pagination.dto';

@Injectable()
export class PaginationService {
  create(createPaginationDto: CreatePaginationDto) {
    return 'This action adds a new pagination';
  }

  findAll() {
    return `This action returns all pagination`;
  }

  findOne(id: number) {
    return `This action returns a #${id} pagination`;
  }

  update(id: number, updatePaginationDto: UpdatePaginationDto) {
    return `This action updates a #${id} pagination`;
  }

  remove(id: number) {
    return `This action removes a #${id} pagination`;
  }
}
