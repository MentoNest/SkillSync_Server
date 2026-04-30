import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EncryptionService } from '../services/encryption.service';
import { EncryptionSubscriber } from '../subscribers/encryption.subscriber';
import { EncryptedQueryService } from '../services/encrypted-query.service';
import { User } from '../../modules/auth/entities/user.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [EncryptionService, EncryptionSubscriber, EncryptedQueryService],
  exports: [EncryptionService, EncryptedQueryService],
})
export class EncryptionModule {}
