import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PinService {
  async hashPin(pin: string): Promise<string> {
    return bcrypt.hash(pin, 10);
  }

  async verifyPin(pin: string, hash: string): Promise<void> {
    const valid = await bcrypt.compare(pin, hash);
    if (!valid) {
      throw new UnauthorizedException('Invalid PIN');
    }
  }
}
