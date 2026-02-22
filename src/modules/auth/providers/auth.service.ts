import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  Inject,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NonceService } from '../../../common/cache/nonce.service';
import { CacheService } from '../../../common/cache/cache.service';
import { NonceResponseDto } from '../dto/nonce-response.dto';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { UserService } from '../../user/providers/user.service';
import { MailService } from '../../mail/mail.service';
import { User } from '../../user/entities/user.entity';
import { Wallet } from '../../user/entities/wallet.entity';
import {
  LoginResponse,
  RegisterResponse,
  JwtPayload,
  RefreshResponse,
  RefreshTokenPayload,
} from '../interfaces/auth.interface';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../../audit/providers/audit.service';
import { Keypair } from 'stellar-sdk';
import { LinkWalletDto } from '../dto/link-wallet.dto';
import { StellarNonceService } from '../providers/nonce.service';


// Re-export interfaces for backward compatibility
export type { LoginResponse };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly nonceService: NonceService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly userService: UserService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly stellarNonceService: StellarNonceService,
    private readonly auditService?: AuditService,
  ) { }

  async generateNonce(ttl: number = 300): Promise<NonceResponseDto> {
    try {
      // Generate a cryptographically secure random nonce (256-bit entropy)
      const nonce = randomBytes(32).toString('hex');
      this.logger.log(`Generated nonce: ${nonce.substring(0, 8)}...`);

      // Store the nonce in cache with TTL
      await this.nonceService.storeNonce(nonce, ttl);
      this.logger.debug(`Stored nonce in cache with TTL: ${ttl} seconds`);

      // Calculate expiration timestamp (Unix timestamp in seconds)
      const expiresAt = Math.floor(Date.now() / 1000) + ttl;

      this.logger.log(`Nonce expires at: ${new Date(expiresAt * 1000).toISOString()}`);

      return {
        nonce,
        expiresAt,
        ttl,
      };
    } catch (error) {
      this.logger.error('Failed to generate nonce:', error);
      throw new BadRequestException('Failed to generate authentication nonce');
    }
  }

  async validateNonce(nonce: string): Promise<boolean> {
    try {
      const isValid = await this.nonceService.isNonceValid(nonce);
      this.logger.debug(`Nonce validation result for ${nonce.substring(0, 8)}...: ${isValid}`);
      return isValid;
    } catch (error) {
      this.logger.error('Failed to validate nonce:', error);
      return false;
    }
  }

  /**
   * 🔐 Login user with email and password
   * Returns JWT access token and safe user payload
   */
  async login(
    loginUserDto: { email: string; password: string },
    context?: { ipAddress?: string; userAgent?: string },
  ): Promise<LoginResponse> {
    const { email, password } = loginUserDto;

    // Find user by email
    const user = await this.userService.findByEmail(email);

    if (!user) {
      // Log failed login - user not found
      await this.auditService?.logLoginFailed({
        email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        reason: 'User not found',
      });
      // Generic error message to prevent user enumeration
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password using configured hashing utility
    const isPasswordValid = await this.verifyPassword(password, user.passwordHash);

    if (!isPasswordValid) {
      // Log failed login - invalid password
      await this.auditService?.logLoginFailed({
        email,
        userId: user.id,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        reason: 'Invalid password',
      });
      // Generic error message to prevent user enumeration
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      // Log failed login - account deactivated
      await this.auditService?.logLoginFailed({
        email,
        userId: user.id,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        reason: 'Account is deactivated',
      });
      throw new UnauthorizedException('Account is deactivated');
    }

    // Generate token pair
    const { accessToken, refreshToken, sessionId } = await this.generateTokenPair(user);

    // Log successful login
    await this.auditService?.logLoginSuccess({
      userId: user.id,
      email: user.email!,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      sessionId,
    });

    // Send login notification email (fire and forget)
    this.mailService
      .sendLoginEmail(
        { email: user.email!, firstName: user.firstName! },
        { time: new Date() }
      )
      .catch((err: Error) => {
        this.logger.error(`Failed to send login email: ${err.message}`);
      });


    // Remove password from user object before returning
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _passwordHash, ...safeUser } = user;

    return {
      accessToken,
      refreshToken,
      user: safeUser as User,
    };
  }

  async refresh(
    refreshToken: string,
    context?: { ipAddress?: string; userAgent?: string },
  ): Promise<RefreshResponse> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const payload = this.verifyRefreshToken(refreshToken);
    const sessionPrefix = this.getSessionPrefix(payload.sid);

    const isRevoked = await this.cacheService.get(`${sessionPrefix}:revoked`);
    if (isRevoked) {
      await this.auditService?.logRefreshToken({
        userId: payload.sub,
        email: payload.email,
        sessionId: payload.sid,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        success: false,
        failureReason: 'Session has been revoked',
      });
      throw new UnauthorizedException('Session has been revoked');
    }

    const currentJti = await this.cacheService.get(`${sessionPrefix}:current-jti`);
    if (!currentJti || currentJti !== payload.jti) {
      await this.revokeSession(payload.sid, this.calculateRemainingTtl(payload.exp));
      await this.auditService?.recordTokenReuseAttempt({
        userId: payload.sub,
        sessionId: payload.sid,
        tokenId: payload.jti,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const user = await this.userService.findById(payload.sub);
    if (!user || !user.isActive) {
      await this.revokeSession(payload.sid, this.calculateRemainingTtl(payload.exp));
      await this.auditService?.logRefreshToken({
        userId: payload.sub,
        email: payload.email,
        sessionId: payload.sid,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        success: false,
        failureReason: 'Session user is not active',
      });
      throw new UnauthorizedException('Session user is not active');
    }

    const newTokenId = this.generateTokenId();
    const newRefreshToken = this.generateRefreshToken(user, payload.sid, payload.family, newTokenId);
    const refreshTtl = this.getRefreshTokenTtl();

    await this.cacheService.set(`${sessionPrefix}:current-jti`, newTokenId, refreshTtl);

    // Log successful refresh
    await this.auditService?.logRefreshToken({
      userId: user.id,
      email: user.email!,
      sessionId: payload.sid,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      success: true,
    });

    return {
      accessToken: this.generateJwtToken(user),
      refreshToken: newRefreshToken,
    };
  }

  /**
   * 📝 Register a new user
   * Creates user account and returns safe user payload
   */
  async register(
    registerDto: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
    },
    context?: { ipAddress?: string; userAgent?: string },
  ): Promise<RegisterResponse> {
    const { firstName, lastName, email, password } = registerDto;

    // Check if user already exists
    const existingUser = await this.userService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password using bcrypt
    const hashedPassword = await this.hashPassword(password);

    // Create new user
    const user = await this.userService.create({
      firstName,
      lastName,
      email,
      passwordHash: hashedPassword,
      isActive: true,
    });

    // Remove password from response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _passwordHash, ...safeUser } = user;

    this.logger.log(`New user registered: ${email}`);

    // Log registration
    await this.auditService?.logRegistration({
      userId: user.id,
      email: user.email!,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    this.mailService
      .sendWelcomeEmail({ email: user.email!, firstName: user.firstName! })
      .catch((err: Error) => {
        this.logger.error(`Failed to send welcome email: ${err.message}`);
      });


    return {
      message: 'User registered successfully',
      user: safeUser as User,
    };
  }

  /**
   * 🔓 Logout user by revoking their session
   */
  async logout(
    refreshToken: string,
    context?: { ipAddress?: string; userAgent?: string },
  ): Promise<{ message: string }> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    try {
      const payload = this.verifyRefreshToken(refreshToken);
      const remainingTtl = this.calculateRemainingTtl(payload.exp);

      // Revoke the session
      await this.revokeSession(payload.sid, remainingTtl);

      // Log logout
      await this.auditService?.logLogout({
        userId: payload.sub,
        email: payload.email,
        sessionId: payload.sid,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });

      return { message: 'Logout successful' };
    } catch (error) {
      this.logger.warn('Logout attempt with invalid token');
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * 🔐 Verify password against hashed password
   * Uses bcrypt for secure password comparison
   */
  private async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * 🔐 Hash password using bcrypt
   */
  async hashPassword(plainPassword: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(plainPassword, saltRounds);
  }

  /**
   * 🔐 Generate JWT token for user using JwtService
   */
  private generateJwtToken(user: User, sessionId?: string): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email!,
      role: user.role,
      sid: sessionId,
      iat: Math.floor(Date.now() / 1000),
      exp:
        Math.floor(Date.now() / 1000) +
        this.parseExpiresIn(this.configService.get<string>('JWT_EXPIRES_IN', '1h')),
    };

    return this.jwtService.sign(payload);
  }

  private async generateTokenPair(user: User): Promise<RefreshResponse & { sessionId: string }> {
    const sessionId = this.generateSessionId();
    const tokenFamily = this.generateTokenFamily();
    const tokenId = this.generateTokenId();
    const refreshToken = this.generateRefreshToken(user, sessionId, tokenFamily, tokenId);

    const refreshTtl = this.getRefreshTokenTtl();
    await this.cacheService.set(`${this.getSessionPrefix(sessionId)}:current-jti`, tokenId, refreshTtl);

    // Store session metadata and index by user
    try {
      const sessionMeta = {
        id: sessionId,
        device: 'unknown',
        ip: 'unknown',
        userAgent: 'unknown',
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      };

      const userKey = `auth:user:${user.id}:sessions`;
      const existing = await this.cacheService.get(userKey);
      const arr = existing ? JSON.parse(existing) : [];
      arr.push(sessionMeta);
      await this.cacheService.set(userKey, JSON.stringify(arr), refreshTtl);
    } catch (err) {
      this.logger.warn('Failed to store session metadata');
    }

    return {
      accessToken: this.generateJwtToken(user, sessionId),
      refreshToken,
      sessionId,
    };
  }

  private generateRefreshToken(
    user: User,
    sessionId: string,
    tokenFamily: string,
    tokenId: string,
  ): string {
    return this.jwtService.sign(
      {
        sub: user.id,
        email: user.email!,
        sid: sessionId,
        family: tokenFamily,
        jti: tokenId,
        type: 'refresh',
      },
      {
        secret: this.getRefreshTokenSecret(),
        expiresIn: this.getRefreshTokenExpiresIn() as any,
      },
    );
  }

  private verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const payload = this.jwtService.verify<RefreshTokenPayload>(token, {
        secret: this.getRefreshTokenSecret(),
      });

      if (payload.type !== 'refresh' || !payload.sid || !payload.jti || !payload.family) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async revokeSession(sessionId: string, ttl: number): Promise<void> {
    const safeTtl = Math.max(1, ttl);
    const sessionPrefix = this.getSessionPrefix(sessionId);

    await this.cacheService.set(`${sessionPrefix}:revoked`, '1', safeTtl);
    await this.cacheService.del(`${sessionPrefix}:current-jti`);
  }

  /**
   * List sessions for a user (paginated)
   */
  async listSessionsForUser(userId: string, page = 1, perPage = 20) {
    const key = `auth:user:${userId}:sessions`;
    const raw = await this.cacheService.get(key);
    const arr = raw ? JSON.parse(raw) : [];

    // Enrich with revoked flag
    const enriched = await Promise.all(
      arr.map(async (s: any) => {
        const revoked = await this.cacheService.get(`${this.getSessionPrefix(s.id)}:revoked`);
        return { ...s, revoked: !!revoked };
      }),
    );

    // Paginate
    const total = enriched.length;
    const start = (page - 1) * perPage;
    const items = enriched.slice(start, start + perPage);

    return { total, page, perPage, items };
  }

  /**
   * Revoke a single session by id and remove from user's session index
   */
  async revokeSessionById(targetUserId: string, sessionId: string) {
    const ttl = this.getRefreshTokenTtl();
    await this.revokeSession(sessionId, ttl);

    // Remove from index
    try {
      const key = `auth:user:${targetUserId}:sessions`;
      const raw = await this.cacheService.get(key);
      if (!raw) return;
      const arr = JSON.parse(raw) as any[];
      const filtered = arr.filter((s) => s.id !== sessionId);
      await this.cacheService.set(key, JSON.stringify(filtered), ttl);
    } catch (err) {
      this.logger.warn('Failed to remove session from user index');
    }
  }

  /**
   * Revoke all sessions for a user except the provided session id (if any)
   */
  async revokeAllSessionsExcept(targetUserId: string, exceptSessionId?: string) {
    const key = `auth:user:${targetUserId}:sessions`;
    const raw = await this.cacheService.get(key);
    const arr = raw ? JSON.parse(raw) : [];
    const ttl = this.getRefreshTokenTtl();

    await Promise.all(
      arr.map(async (s: any) => {
        if (s.id === exceptSessionId) return;
        await this.revokeSession(s.id, ttl);
      }),
    );

    // Keep exceptSessionId in index if provided
    const remaining = exceptSessionId ? arr.filter((s: any) => s.id === exceptSessionId) : [];
    await this.cacheService.set(key, JSON.stringify(remaining), ttl);
  }

  private calculateRemainingTtl(exp: number): number {
    return Math.max(1, exp - Math.floor(Date.now() / 1000));
  }

  private getSessionPrefix(sessionId: string): string {
    return `auth:session:${sessionId}`;
  }

  private getRefreshTokenSecret(): string {
    return this.configService.get<string>(
      'JWT_REFRESH_SECRET',
      this.configService.get<string>('JWT_SECRET', 'dev-secret-key-for-skill-sync-server'),
    );
  }

  private getRefreshTokenExpiresIn(): string {
    return this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
  }

  private getRefreshTokenTtl(): number {
    return this.parseExpiresIn(this.getRefreshTokenExpiresIn());
  }

  private generateSessionId(): string {
    return randomBytes(16).toString('hex');
  }

  private generateTokenFamily(): string {
    return randomBytes(16).toString('hex');
  }

  private generateTokenId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Parse JWT expiresIn string to seconds
   */
  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // Default 1 hour

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 24 * 60 * 60;
      default:
        return 3600;
    }
  }

  async linkWallet(userId: string, dto: LinkWalletDto): Promise<User> {
    const { address, nonce, signature } = dto;

    // 1. Verify Nonce
    const isValidNonce = this.stellarNonceService.consume(address, nonce);
    if (!isValidNonce) {
      throw new BadRequestException('Invalid or expired nonce');
    }

    // 2. Verify Signature
    try {
      const keypair = Keypair.fromPublicKey(address);
      const isValidSignature = keypair.verify(Buffer.from(nonce, 'utf8'), Buffer.from(signature, 'base64'));
      if (!isValidSignature) {
        throw new UnauthorizedException('Invalid signature');
      }
    } catch (err) {
      throw new BadRequestException('Invalid public key or signature format');
    }

    // 3. Check if wallet is already linked to another user
    const existingUser = await this.userService.findByPublicKey(address);
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException('Wallet already linked to another account');
    }

    // 4. Link wallet
    return this.userService.linkWallet(userId, address);
  }

  async removeWallet(userId: string, address: string, dto: LinkWalletDto): Promise<User> {
    const { nonce, signature, address: dtoAddress } = dto;
    if (address !== dtoAddress) {
      throw new BadRequestException('Address mismatch');
    }

    // 1. Verify Nonce
    const isValidNonce = this.stellarNonceService.consume(address, nonce);
    if (!isValidNonce) {
      throw new BadRequestException('Invalid or expired nonce');
    }

    // 2. Verify Signature
    try {
      const keypair = Keypair.fromPublicKey(address);
      const isValidSignature = keypair.verify(Buffer.from(nonce, 'utf8'), Buffer.from(signature, 'base64'));
      if (!isValidSignature) {
        throw new UnauthorizedException('Invalid signature');
      }
    } catch (err) {
      throw new BadRequestException('Invalid public key or signature format');
    }

    // 3. Remove wallet
    return this.userService.removeWallet(userId, address);
  }

  async setPrimaryWallet(userId: string, address: string): Promise<User> {
    return this.userService.setPrimaryWallet(userId, address);
  }

  /**
   * 📧 Forgot password - sends OTP to user's email
   * @param dto Contains user's email
   * @returns Success message
   */
  async forgotPassword(dto: { email: string }): Promise<{ message: string }> {
    // Check if user exists
    const user = await this.userService.findByEmail(dto.email);
    
    // Even if user doesn't exist, return success to prevent user enumeration attacks
    if (!user) {
      this.logger.log(`Forgot password requested for non-existent email: ${dto.email}`);
      return { message: 'If an account exists, an OTP has been sent to your email' };
    }
    
    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP in cache with 10-minute expiry (600 seconds)
    const otpCacheKey = `otp:${dto.email}`;
    await this.cacheService.set(otpCacheKey, otp, 600); // 10 minutes
    
    // Send OTP email
    await this.mailService.sendOtpEmail(dto.email, otp);
    
    this.logger.log(`OTP sent for email: ${dto.email}`);
    return { message: 'If an account exists, an OTP has been sent to your email' };
  }

  /**
   * ✅ Verify OTP
   * @param dto Contains email and OTP
   * @returns Verification result
   */
  async verifyOtp(dto: { email: string; otp: string }): Promise<{ valid: boolean; message: string }> {
    const otpCacheKey = `otp:${dto.email}`;
    
    // Get stored OTP from cache
    const storedOtp = await this.cacheService.get(otpCacheKey);
    
    // Check if OTP exists and is valid
    if (!storedOtp || storedOtp !== dto.otp) {
      this.logger.log(`Invalid OTP provided for email: ${dto.email}`);
      return { valid: false, message: 'Invalid or expired OTP' };
    }
    
    // OTP is valid
    return { valid: true, message: 'OTP verified successfully' };
  }

  /**
   * 🔐 Reset password after verifying OTP
   * @param dto Contains email, OTP, and new password
   * @returns Success message
   */
  async resetPassword(dto: { email: string; otp: string; newPassword: string }): Promise<{ message: string }> {
    const otpCacheKey = `otp:${dto.email}`;
    
    // Get stored OTP from cache
    const storedOtp = await this.cacheService.get(otpCacheKey);
    
    // Check if OTP exists and is valid
    if (!storedOtp || storedOtp !== dto.otp) {
      this.logger.log(`Invalid OTP provided for password reset: ${dto.email}`);
      throw new BadRequestException('Invalid or expired OTP');
    }
    
    // Find user by email
    const user = await this.userService.findByEmail(dto.email);
    
    if (!user) {
      throw new BadRequestException('Invalid or expired OTP');
    }
    
    // Hash the new password
    const hashedPassword = await this.hashPassword(dto.newPassword);
    
    // Update user's password
    await this.userService.updatePassword(user.id, hashedPassword);
    
    // Invalidate the OTP (one-time use)
    await this.cacheService.del(otpCacheKey);
    
    // Revoke all existing sessions for security
    await this.revokeAllSessionsExcept(user.id);
    
    this.logger.log(`Password reset successful for email: ${dto.email}`);
    return { message: 'Password has been reset successfully' };
  }
}

