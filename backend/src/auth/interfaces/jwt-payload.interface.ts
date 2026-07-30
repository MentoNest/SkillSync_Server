import { UserStatus } from '../../users/enums/user-status.enum.js';

export interface JwtAccessTokenPayload {
  sub: string;
  wallet: string;
  jti: string;
  iat: number;
  exp: number;
  roles?: string[];
  status: UserStatus;
}
