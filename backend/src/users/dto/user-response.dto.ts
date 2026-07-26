import { User } from '../entities/user.entity.js';
import { UserStatus } from '../enums/user-status.enum.js';
import { AuthRole } from '../../common/enums/auth-role.enum.js';

export class UserResponseDto {
  id: string;
  walletAddress: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
  status: UserStatus;
  roles: AuthRole[];
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.walletAddress = user.walletAddress;
    dto.username = user.username ?? null;
    dto.displayName = user.displayName ?? null;
    dto.email = user.email ?? null;
    dto.status = user.status;
    dto.roles = (user.roles ?? []).map((role) => role.name);
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
