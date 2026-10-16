import { Module } from '@nestjs/common';
import { KnownDeviceDetector } from './known-device.detector';
import { SUSPICIOUS_LOGIN_DETECTORS } from './suspicious-login';
import { SuspiciousLoginService } from './suspicious-login.service';

@Module({
  providers: [
    KnownDeviceDetector,
    { provide: SUSPICIOUS_LOGIN_DETECTORS, useFactory: (d: KnownDeviceDetector) => [d], inject: [KnownDeviceDetector] },
    SuspiciousLoginService,
  ],
  exports: [SuspiciousLoginService],
})
export class SecurityModule {}
