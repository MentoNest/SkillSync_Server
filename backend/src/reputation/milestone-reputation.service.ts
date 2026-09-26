import { Injectable, Logger } from '@nestjs/common';

export interface UserReputation {
  userId: string;
  ratingScore: number;
  totalReviews: number;
}

export interface MilestonePayment {
  milestoneId: string;
  totalAmount: bigint;
  releasedAmount: bigint;
  percentageReleased: number;
}

@Injectable()
export class MilestoneReputationService {
  private readonly logger = new Logger(MilestoneReputationService.name);
  private readonly userReputations = new Map<string, UserReputation>();
  private readonly milestonePayments = new Map<string, MilestonePayment>();

  /**
   * Updates buyer/seller reputation score based on completed session reviews.
   */
  public updateUserRating(userId: string, newRating: number): UserReputation {
    const current = this.userReputations.get(userId) || { userId, ratingScore: 0, totalReviews: 0 };
    const updatedScore = (current.ratingScore * current.totalReviews + newRating) / (current.totalReviews + 1);
    const updated: UserReputation = {
      userId,
      ratingScore: Number(updatedScore.toFixed(2)),
      totalReviews: current.totalReviews + 1,
    };
    this.userReputations.set(userId, updated);
    this.logger.log(`Updated rating for user ${userId}: ${updated.ratingScore}`);
    return updated;
  }

  /**
   * Handles partial release of milestone payments based on completion percentage.
   */
  public releasePartialMilestone(milestoneId: string, totalAmount: bigint, releasePercentage: number): MilestonePayment {
    const releaseAmount = (totalAmount * BigInt(Math.min(releasePercentage, 100))) / BigInt(100);
    const milestone: MilestonePayment = {
      milestoneId,
      totalAmount,
      releasedAmount: releaseAmount,
      percentageReleased: releasePercentage,
    };
    this.milestonePayments.set(milestoneId, milestone);
    this.logger.log(`Released ${releaseAmount.toString()} for milestone ${milestoneId}`);
    return milestone;
  }
}
