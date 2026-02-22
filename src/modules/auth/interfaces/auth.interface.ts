import { User } from '../../user/entities/user.entity';
import { UserRole } from '../../../common/enums/user-role.enum';

/**
 * JWT Payload interface
 */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  sid?: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload extends JwtPayload {
  sid: string;
  family: string;
  jti: string;
  type: 'refresh';
}

/**
 * Login response interface
 */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: Omit<User, 'password'>;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  sessionId?: string;
}

/**
 * Register response interface
 */
export interface RegisterResponse {
  message: string;
  user: Omit<User, 'password'>;
}

/**
 * Authenticated user request interface
 */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

/**
 * Token payload interface
 */
export interface TokenPayload {
  sub: string;
  email: string;
}

/**
 * Auth configuration interface
 */
export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshTokenSecret?: string;
  refreshTokenExpiresIn?: string;
}
