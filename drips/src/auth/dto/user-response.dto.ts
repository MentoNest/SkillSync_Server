import { UserRole, UserStatus } from '@libs/common';

export class UserResponseDto {
  id!: string;
  email!: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  roles!: UserRole[];
  status!: UserStatus;
  isActive!: boolean;
  emailVerifiedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
