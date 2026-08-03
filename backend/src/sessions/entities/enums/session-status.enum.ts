export enum SessionStatus {
  // Original statuses
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
  
  // New blockchain-aligned statuses
  CREATED = 'created',
  LOCKED = 'locked',
  MILESTONE_IN_PROGRESS = 'milestone_in_progress',
  APPROVED = 'approved',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed',
  RESOLVED = 'resolved',
  COMPLETED_WITH_DISPUTE = 'completed_with_dispute',
  ARCHIVED = 'archived',
}