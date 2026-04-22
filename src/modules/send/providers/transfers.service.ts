import { Injectable } from '@nestjs/common';

export interface Transfer {
  id: string;
  fromUserId: string;
  toUserId: string;
  amountUsdc: number;
  feeUsdc: number;
  netAmountUsdc: number;
  note?: string;
  createdAt: Date;
}

@Injectable()
export class TransfersService {
  /**
   * Creates a transfer record and submits the on-chain transaction.
   * Replace the stub body with actual Stellar/on-chain logic.
   */
  async create(params: {
    fromUserId: string;
    toUserId: string;
    amountUsdc: number;
    feeUsdc: number;
    netAmountUsdc: number;
    note?: string;
  }): Promise<Transfer> {
    // TODO: submit Stellar payment here
    return {
      id: crypto.randomUUID(),
      ...params,
      createdAt: new Date(),
    };
  }

  /** Returns total USDC sent by a user today (UTC). */
  async getDailyUsed(_userId: string): Promise<number> {
    // TODO: query transfer records filtered by today's date
    return 0;
  }
}
