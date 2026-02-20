import { User } from '../../user/entities/user.entity';

/**
 * JWT Payload interface
 */
export interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

/**
 * Login response interface
 */
export interface LoginResponse {
  accessToken: string;
  user: Omit<User, 'password'>;
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
