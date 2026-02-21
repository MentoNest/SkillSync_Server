import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditService {
  create() {
    return 'This action adds a new audit';
  }

  findAll() {
    return `This action returns all audit`;
  }

  findOne(id: number) {
    return `This action returns a #${id} audit`;
  }

  update(id: number) {
    return `This action updates a #${id} audit`;
  }

  remove(id: number) {
    return `This action removes a #${id} audit`;
  }
}
