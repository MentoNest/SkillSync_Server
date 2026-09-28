import { Module, Global } from '@nestjs/common';
import { EncryptionService } from './encryption.service.js';

@Global()
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
