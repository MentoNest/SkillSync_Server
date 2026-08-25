import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';

interface PlatformState {
  admin: string;
  platform_fee_bps: number;
}

@Injectable()
export class AppService {
  private platformState: PlatformState = {
    admin: 'admin_wallet_public_key', // This should be stored in secure environment variables
    platform_fee_bps: 100, // Default 1% fee (100 bps)
  };

  // Get current platform fee
  getPlatformFee(): number {
    return this.platformState.platform_fee_bps;
  }

  // Set new platform fee (admin only)
  setPlatformFee(newFeeBps: number, requesterWallet: string): { previousFee: number; newFee: number } {
    // Check if requester is admin
    if (requesterWallet !== this.platformState.admin) {
      throw new ForbiddenException('Only admin can update platform fee');
    }

    // Validate fee is between 0 and 1000 bps (0-10%)
    if (newFeeBps < 0 || newFeeBps > 1000) {
      throw new BadRequestException('Fee must be between 0 and 1000 basis points (0-10%)');
    }

    const previousFee = this.platformState.platform_fee_bps;
    this.platformState.platform_fee_bps = newFeeBps;
    
    // Emit event (in production, use an event emitter to log this)
    console.log(`PlatformFeeUpdated: previous_fee=${previousFee}, new_fee=${newFeeBps}, updated_by=${requesterWallet}`);
    
    return {
      previousFee,
      newFee: newFeeBps,
    };
  }

  // Initialize platform state (called once on startup)
  initialize(initialFeeBps: number, adminWallet: string) {
    if (initialFeeBps < 0 || initialFeeBps > 1000) {
      throw new BadRequestException('Initial fee must be between 0 and 1000 basis points');
    }
    this.platformState = {
      admin: adminWallet,
      platform_fee_bps: initialFeeBps,
    };
    console.log(`Platform initialized: admin=${adminWallet}, initial_fee=${initialFeeBps} bps`);
  }
}