import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../payment.entity';
import { CreatePaymentDto } from '../dto/createPayment.dto';
import { UpdatePaymentDto } from '../dto/updatePayment.dto';
import { RedisService } from 'src/common/redis/cache.service';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private readonly redisService: RedisService
  ) {}

  async create(createPaymentDto: CreatePaymentDto): Promise<Payment> {
    const payment = this.paymentRepository.create(createPaymentDto);
    await this.paymentRepository.save(payment);
    await this.redisService.set(`payment:${payment.id}`, payment, 1800);
    await this.redisService.delete('payments:all');

    if (payment.userId) {
      await this.redisService.delete(`user:${payment.userId}:payments`);
    }

    return payment;
  }

  async findAll(): Promise<Payment[]> {
    const cachedPayments = await this.redisService.get<Payment[]>('payments:all');
    if (cachedPayments) {
      return cachedPayments;
    }

    const payments = await this.paymentRepository.find();
    await this.redisService.set('payments:all', payments, 900);

    return payments;
  }

  async findPaymentsByUserId(userId: number): Promise<Payment[]> {
    const cacheKey = `user:${userId}:payments`;
    const cachedPayments = await this.redisService.get<Payment[]>(cacheKey);
    if (cachedPayments) {
      return cachedPayments;
    }

    const userPayments = await this.paymentRepository.find({ where: { userId } });
    await this.redisService.set(cacheKey, userPayments, 900);

    return userPayments;
  }

  async findOne(id: number): Promise<Payment> {
    const cachedPayment = await this.redisService.get<Payment>(`payment:${id}`);
    if (cachedPayment) {
      return cachedPayment;
    }

    const payment = await this.paymentRepository.findOne({ where: { id } });
    if (!payment) {
      throw new NotFoundException(`Payment with id ${id} not found`);
    }

    await this.redisService.set(`payment:${id}`, payment, 1800);
    return payment;
  }

  async update(id: number, updatePaymentDto: UpdatePaymentDto): Promise<Payment> {
    let payment = await this.paymentRepository.preload({
      id,
      ...updatePaymentDto,
    });
    if (!payment) {
      throw new NotFoundException(`Payment with id ${id} not found`);
    }

    payment = await this.paymentRepository.save(payment);
    await this.redisService.set(`payment:${id}`, payment, 1800);
    await this.redisService.delete('payments:all');

    if (payment.userId) {
      await this.redisService.delete(`user:${payment.userId}:payments`);
    }

    return payment;
  }

  async remove(id: number): Promise<void> {
    const payment = await this.paymentRepository.findOne({ where: { id } });
    if (!payment) {
      throw new NotFoundException(`Payment with id ${id} not found`);
    }

    await this.paymentRepository.delete(id);
    await this.redisService.delete(`payment:${id}`);
    await this.redisService.delete('payments:all');

    if (payment.userId) {
      await this.redisService.delete(`user:${payment.userId}:payments`);
    }
  }
}
