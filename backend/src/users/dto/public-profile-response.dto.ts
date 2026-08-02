import { User } from '../entities/user.entity.js';
import { AuthRole } from '../../common/enums/auth-role.enum.js';

/** #1003: Public-facing profile — excludes wallet address, email, and status. */
export class PublicProfileResponseDto {
  id: string;
  username: string | null;
  displayName: string | null;
  roles: AuthRole[];
  createdAt: Date;

  static fromEntity(user: User): PublicProfileResponseDto {
    const dto = new PublicProfileResponseDto();
    dto.id = user.id;
    dto.username = user.username ?? null;
    dto.displayName = user.displayName ?? null;
    dto.roles = (user.roles ?? []).map((role) => role.name);
    dto.createdAt = user.createdAt;
    return dto;
  }
}
