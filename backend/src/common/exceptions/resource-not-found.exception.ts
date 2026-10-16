import { NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes';

export class ResourceNotFoundException extends NotFoundException {
  constructor(resource: string, id?: string) {
    super({
      statusCode: 404,
      message: id ? `${resource} '${id}' not found` : `${resource} not found`,
      error: 'Not Found',
      code: ErrorCode.RESOURCE_NOT_FOUND,
    });
  }
}
