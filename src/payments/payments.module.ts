import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentService } from './providers/payment.service';
import { PaymentController } from './payment.controller';
import { Payment } from './payment.entity';
import { RedisModule } from 'src/common/redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
