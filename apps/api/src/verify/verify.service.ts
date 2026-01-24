import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Kyc, KycStatus } from './entities/kyc.entity';
import { CreateKycDto } from './dto/create-kyc.dto';
import { UpdateKycDto } from './dto/update-kyc.dto';
import { WebhookKycDto } from './dto/webhook-kyc.dto';

@Injectable()
export class VerifyService {
  private readonly logger = new Logger(VerifyService.name);

  constructor(
    @InjectRepository(Kyc)
    private kycRepository: Repository<Kyc>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async getUserKyc(userId: string): Promise<Kyc> {
    const kyc = await this.kycRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!kyc) {
      // Create default unverified KYC record if it doesn't exist
      return this.createDefaultKyc(userId);
    }

    return kyc;
  }

  private async createDefaultKyc(userId: string): Promise<Kyc> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const kyc = new Kyc();
    kyc.user = user;
    kyc.status = KycStatus.UNVERIFIED;
    kyc.provider = null;
    kyc.externalRef = null;
    kyc.reason = null;
    kyc.updatedBy = null;

    return await this.kycRepository.save(kyc);
  }

  async updateKycByAdmin(
    userId: string,
    updateKycDto: UpdateKycDto,
    adminId: string,
  ): Promise<Kyc> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    let kyc = await this.kycRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!kyc) {
      // Create KYC record if it doesn't exist
      kyc = new Kyc();
      kyc.user = user;
    }

    // Log the status transition for audit purposes
    const oldStatus = kyc.status;
    const newStatus = updateKycDto.status;

    this.logger.log(
      `KYC status update for user ${userId}: ${oldStatus} -> ${newStatus} by admin ${adminId}`,
    );

    // Update the KYC record
    Object.assign(kyc, {
      status: updateKycDto.status,
      provider: updateKycDto.provider || kyc.provider,
      externalRef: updateKycDto.externalRef || kyc.externalRef,
      reason: updateKycDto.reason || kyc.reason,
      updatedBy: adminId,
    });

    return await this.kycRepository.save(kyc);
  }

  async handleWebhook(webhookKycDto: WebhookKycDto): Promise<Kyc> {
    const { userId, status, provider, externalRef, reason } = webhookKycDto;

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    let kyc = await this.kycRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!kyc) {
      // Create KYC record if it doesn't exist
      kyc = new Kyc();
      kyc.user = user;
    }

    // Log the status transition for audit purposes
    const oldStatus = kyc.status;
    const newStatus = status;

    this.logger.log(
      `KYC webhook update for user ${userId}: ${oldStatus} -> ${newStatus} from provider ${provider}`,
    );

    // Update the KYC record
    Object.assign(kyc, {
      status,
      provider: provider || kyc.provider,
      externalRef: externalRef || kyc.externalRef,
      reason: reason || kyc.reason,
      updatedBy: provider, // Track provider as updater for webhook updates
    });

    return await this.kycRepository.save(kyc);
  }

  async findAll(): Promise<Kyc[]> {
    return await this.kycRepository.find({
      relations: ['user'],
    });
  }
}
