import { Injectable } from '@nestjs/common';
import { HealthStatus, DateUtil } from '@app/common';

@Injectable()
export class HealthService {
  check(): HealthStatus {
    return {
      status: 'ok',
      timestamp: DateUtil.getCurrentTimestamp(),
    };
  }
}
