import { Injectable, BadRequestException } from '@nestjs/common';

interface PlatformState {
  platform_fee_bps: number;
}

@Injectable()
export class AppService {
  private platformState: PlatformState = {
    platform_fee_bps: 100, // Default 1% fee (100 bps)
  };

  // Get current platform fee
  getPlatformFee(): number {
    return this.platformState.platform_fee_bps;
  }

  // Set new platform fee (admin only - already protected by RolesGuard)
  setPlatformFee(newFeeBps: number): { previousFee: number; newFee: number } {
    // Validate fee is between 0 and 1000 bps (0-10%)
    if (newFeeBps < 0 || newFeeBps > 1000) {
      throw new BadRequestException('Fee must be between 0 and 1000 basis points (0-10%)');
    }

    const previousFee = this.platformState.platform_fee_bps;
    this.platformState.platform_fee_bps = newFeeBps;
    
    // Emit event (in production, use an event emitter to log this)
    console.log(`PlatformFeeUpdated: previous_fee=${previousFee}, new_fee=${newFeeBps}`);
    
    return {
      previousFee,
      newFee: newFeeBps,
    };
  }
}