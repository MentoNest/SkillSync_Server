import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

@Injectable()
export class NonceProvider {
  generate(): string {
    return randomBytes(32).toString('hex');
  }
}
