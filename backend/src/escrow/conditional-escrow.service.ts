import { Injectable, Logger } from '@nestjs/common';

export interface EscrowCondition {
  externalContractId: string;
  requiredStatus: string;
  isMet: boolean;
}

export interface InsurancePool {
  poolId: string;
  totalReserve: bigint;
  coverageRatio: number;
}

@Injectable()
export class ConditionalEscrowService {
  private readonly logger = new Logger(ConditionalEscrowService.name);
  private readonly conditions = new Map<string, EscrowCondition>();
  private readonly insurancePools = new Map<string, InsurancePool>();

  /**
   * Evaluates if conditional escrow release requirements are met based on external contract state.
   */
  public evaluateEscrowCondition(escrowId: string, externalStatus: string): boolean {
    const condition = this.conditions.get(escrowId);
    if (!condition) {
      this.logger.warn(`No condition found for escrow ID: ${escrowId}`);
      return false;
    }
    condition.isMet = condition.requiredStatus === externalStatus;
    this.logger.log(`Escrow ${escrowId} condition met status: ${condition.isMet}`);
    return condition.isMet;
  }

  /**
   * Registers a smart contract insurance pool reserve for coverage protection.
   */
  public registerInsurancePool(poolId: string, initialReserve: bigint, ratio: number = 0.85): InsurancePool {
    const pool: InsurancePool = {
      poolId,
      totalReserve: initialReserve,
      coverageRatio: ratio,
    };
    this.insurancePools.set(poolId, pool);
    this.logger.log(`Insurance pool ${poolId} registered with reserve ${initialReserve.toString()}`);
    return pool;
  }
}
