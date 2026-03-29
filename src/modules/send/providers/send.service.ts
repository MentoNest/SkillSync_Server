import { Injectable, NotFoundException } from '@nestjs/common';
import { UserService } from '../../user/providers/user.service';
import { FeeService, UserTier } from './fee.service';
import { PinService } from './pin.service';
import { TransfersService } from './transfers.service';
import { PublicProfileDto } from '../../profile/dto/public-profile.dto';
import { UserRole } from '../../../common/enums/user-role.enum';
import { User } from '../../user/entities/user.entity';

@Injectable()
export class SendService {
  constructor(
    private readonly userService: UserService,
    private readonly feeService: FeeService,
    private readonly pinService: PinService,
    private readonly transfersService: TransfersService,
  ) {}

  private getUserTier(_user: User): UserTier {
    // Extend with real tier logic (e.g. subscription field on User)
    return UserTier.BASIC;
  }

  private toPublicProfile(user: User): PublicProfileDto {
    return {
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role as UserRole,
      createdAt: user.createdAt,
    };
  }

  async getRecipient(username: string): Promise<PublicProfileDto> {
    const user = await this.userService.findByUsername(username);
    if (!user) throw new NotFoundException(`User '${username}' not found`);
    return this.toPublicProfile(user);
  }

  async preview(senderId: string, toUsername: string, amountUsdc: number) {
    const sender = await this.userService.findById(senderId);
    if (!sender) throw new NotFoundException('Sender not found');

    const recipient = await this.getRecipient(toUsername);
    const tier = this.getUserTier(sender);
    const usedToday = await this.transfersService.getDailyUsed(senderId);

    this.feeService.checkDailyLimit(amountUsdc, usedToday, tier);

    const { feeUsdc, netAmountUsdc, exchangeRateNgn, estimatedNgn } =
      this.feeService.computeFee(amountUsdc, tier);

    return { recipient, amountUsdc, feeUsdc, netAmountUsdc, exchangeRateNgn, estimatedNgn };
  }

  async confirm(
    senderId: string,
    toUsername: string,
    amountUsdc: number,
    pin: string,
    note?: string,
  ) {
    const sender = await this.userService.findById(senderId);
    if (!sender) throw new NotFoundException('Sender not found');

    // PIN stored as hash on user — extend User entity with pinHash field
    const pinHash: string = (sender as User & { pinHash?: string }).pinHash ?? '';
    await this.pinService.verifyPin(pin, pinHash);

    const recipientUser = await this.userService.findByUsername(toUsername);
    if (!recipientUser) throw new NotFoundException(`User '${toUsername}' not found`);

    const tier = this.getUserTier(sender);
    const usedToday = await this.transfersService.getDailyUsed(senderId);
    this.feeService.checkDailyLimit(amountUsdc, usedToday, tier);

    const { feeUsdc, netAmountUsdc } = this.feeService.computeFee(amountUsdc, tier);

    return this.transfersService.create({
      fromUserId: sender.id,
      toUserId: recipientUser.id,
      amountUsdc,
      feeUsdc,
      netAmountUsdc,
      note,
    });
  }

  async getLimits(userId: string) {
    const user = await this.userService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const tier = this.getUserTier(user);
    const { dailyLimitUsdc } = this.feeService.getTierConfig(tier);
    const usedToday = await this.transfersService.getDailyUsed(userId);
    const remaining = Math.max(0, dailyLimitUsdc - usedToday);

    return { tier, dailyLimitUsdc, usedTodayUsdc: usedToday, remainingUsdc: remaining };
  }
}
