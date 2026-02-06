import { Injectable } from '@nestjs/common';
import { CreateRediDto } from '../dto/create-redi.dto';
import { UpdateRediDto } from '../dto/update-redi.dto';

@Injectable()
export class RedisService {
  create(createRediDto: CreateRediDto) {
    return 'This action adds a new redi';
  }

  findAll() {
    return `This action returns all redis`;
  }

  findOne(id: number) {
    return `This action returns a #${id} redi`;
  }

  update(id: number, updateRediDto: UpdateRediDto) {
    return `This action updates a #${id} redi`;
  }

  remove(id: number) {
    return `This action removes a #${id} redi`;
  }
}
