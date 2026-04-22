import { Injectable, BadRequestException } from '@nestjs/common';

export enum UserTier {
  BASIC = 'basic',
  STANDARD = 'standard',
  PREMIUM = 'premium',
}

export interface TierConfig {
  feePercent: number;
  dailyLimitUsdc: number;
}

export interface FeeResult {
  feeUsdc: number;
  netAmountUsdc: number;
  exchangeRateNgn: number;
  estimatedNgn: number;
}

const TIER_CONFIG: Record<UserTier, TierConfig> = {
  [UserTier.BASIC]: { feePercent: 0.02, dailyLimitUsdc: 500 },
  [UserTier.STANDARD]: { feePercent: 0.015, dailyLimitUsdc: 2000 },
  [UserTier.PREMIUM]: { feePercent: 0.01, dailyLimitUsdc: 10000 },
};

// Placeholder rate — replace with live oracle/feed in production
const NGN_RATE = 1600;

@Injectable()
export class FeeService {
  getTierConfig(tier: UserTier): TierConfig {
    return TIER_CONFIG[tier];
  }

  computeFee(amountUsdc: number, tier: UserTier): FeeResult {
    const { feePercent } = TIER_CONFIG[tier];
    const feeUsdc = parseFloat((amountUsdc * feePercent).toFixed(6));
    const netAmountUsdc = parseFloat((amountUsdc - feeUsdc).toFixed(6));
    const exchangeRateNgn = NGN_RATE;
    const estimatedNgn = parseFloat((netAmountUsdc * exchangeRateNgn).toFixed(2));
    return { feeUsdc, netAmountUsdc, exchangeRateNgn, estimatedNgn };
  }

  checkDailyLimit(amountUsdc: number, usedTodayUsdc: number, tier: UserTier): void {
    const { dailyLimitUsdc } = TIER_CONFIG[tier];
    if (usedTodayUsdc + amountUsdc > dailyLimitUsdc) {
      throw new BadRequestException(
        `Daily limit of ${dailyLimitUsdc} USDC exceeded. Used: ${usedTodayUsdc}, Requested: ${amountUsdc}`,
      );
    }
  }
}
