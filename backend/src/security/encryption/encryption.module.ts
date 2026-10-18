import { Global, Module, OnModuleInit } from '@nestjs/common';
import { configureColumnEncryption } from './encrypted-column.transformer';
import { FieldEncryptionService } from './field-encryption.service';

@Global()
@Module({
  providers: [FieldEncryptionService],
  exports: [FieldEncryptionService],
})
export class EncryptionModule implements OnModuleInit {
  constructor(private readonly encryption: FieldEncryptionService) {}

  onModuleInit(): void {
    configureColumnEncryption(this.encryption);
  }
}
