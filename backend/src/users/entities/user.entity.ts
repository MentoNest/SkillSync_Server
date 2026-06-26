import { Role } from './role.entity';
import { UserStatus } from '../enums/user-status.enum';

export class User {
  id!: string;
  walletAddress!: string;
  tokenVersion!: number;
  status!: UserStatus;
  username!: string | null;
  displayName!: string | null;
  usernameChangedAt!: Date | null;
  deletedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
  roles!: Role[];
  isFeatured?: boolean;
  featuredAt?: Date | null;
  featuredOrder?: number | null;
  avatarUrl?: string | null;
  avatarThumbnailUrl?: string | null;
  isVerified?: boolean;
  verifiedAt?: Date | null;
  verifiedBy?: string | null;
  verificationNotes?: string | null;
  timezone?: string;
}
