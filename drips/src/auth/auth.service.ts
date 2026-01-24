import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto, AuthTokensDto } from './dto/auth-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import * as crypto from 'crypto';
import { RefreshToken } from './entities/refresh-token.entity';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { MockMailer } from '../../../libs/common/src/mailer/mock-mailer';
import { TokenUtil } from '../../../libs/common/src/utils/token.util';
import { RequestVerificationDto } from './dto/request-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_SALT_ROUNDS = 10;
  private readonly TOKEN_EXPIRY_HOURS = 24; // for verification and reset

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(EmailVerificationToken)
    private emailVerificationTokenRepository: Repository<EmailVerificationToken>,
    @InjectRepository(PasswordResetToken)
    private passwordResetTokenRepository: Repository<PasswordResetToken>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailer: MockMailer,
  ) {}

  // Helper: Hash token
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async sendVerificationEmail(user: User): Promise<void> {
    const token = TokenUtil.generateToken();
    const tokenHash = TokenUtil.hashToken(token);
    const expiresAt = new Date(
      Date.now() + this.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    const verificationToken = this.emailVerificationTokenRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    await this.emailVerificationTokenRepository.save(verificationToken);

    const subject = 'Verify your email';
    const html = `Click here to verify: http://localhost:3000/auth/verify-email?token=${token}`;

    await this.mailer.send(user.email, subject, html);
  }

  async requestVerification(dto: RequestVerificationDto): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (!user) {
      // Don't leak if user exists
      return;
    }
    if (user.emailVerifiedAt) {
      return;
    }
    await this.sendVerificationEmail(user);
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const tokenHash = TokenUtil.hashToken(dto.token);

    const tokenEntity = await this.emailVerificationTokenRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!tokenEntity || TokenUtil.isExpired(tokenEntity.expiresAt)) {
      throw new BadRequestException('Invalid or expired token');
    }

    const user = tokenEntity.user;
    if (user.emailVerifiedAt) {
      throw new BadRequestException('Email already verified');
    }

    user.emailVerifiedAt = new Date();
    await this.userRepository.save(user);

    // Delete the token
    await this.emailVerificationTokenRepository.delete(tokenEntity.id);
  }

  async requestPasswordReset(dto: RequestPasswordResetDto): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (!user) {
      // Don't leak
      return;
    }

    const token = TokenUtil.generateToken();
    const tokenHash = TokenUtil.hashToken(token);
    const expiresAt = new Date(
      Date.now() + this.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    const resetToken = this.passwordResetTokenRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    await this.passwordResetTokenRepository.save(resetToken);

    const subject = 'Reset your password';
    const html = `Click here to reset: http://localhost:3000/auth/reset-password?token=${token}`;

    await this.mailer.send(user.email, subject, html);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = TokenUtil.hashToken(dto.token);

    const tokenEntity = await this.passwordResetTokenRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!tokenEntity || TokenUtil.isExpired(tokenEntity.expiresAt)) {
      throw new BadRequestException('Invalid or expired token');
    }

    const user = tokenEntity.user;
    const newPasswordHash = await bcrypt.hash(
      dto.newPassword,
      this.BCRYPT_SALT_ROUNDS,
    );

    user.password_hash = newPasswordHash;
    await this.userRepository.save(user);

    // Delete the token
    await this.passwordResetTokenRepository.delete(tokenEntity.id);

    // Revoke all sessions
    await this.revokeAllUserTokens(user.id);
  }

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { email, password, firstName, lastName } = registerDto;

    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const password_hash = await bcrypt.hash(password, this.BCRYPT_SALT_ROUNDS);

    const user = this.userRepository.create({
      email,
      firstName,
      lastName,
      password_hash,
    });

    const savedUser = await this.userRepository.save(user);

    // Send verification email
    await this.sendVerificationEmail(savedUser);

    const tokens = await this.generateTokens(savedUser);

    return {
      id: savedUser.id,
      email: savedUser.email,
      firstName: savedUser.firstName,
      lastName: savedUser.lastName,
      tokens,
    };
  }

  async login(
    loginDto: LoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user || !user.password_hash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException('Email not verified');
    }

    const tokens = await this.generateTokens(user, ip, userAgent);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      tokens,
    };
  }

  async rotateRefreshToken(
    oldToken: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokensDto> {
    const oldTokenHash = this.hashToken(oldToken);

    const tokenRecord = await this.refreshTokenRepository.findOne({
      where: { tokenHash: oldTokenHash },
      relations: ['user'],
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (tokenRecord.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for user ${tokenRecord.userId}. Revoking all tokens.`,
      );
      await this.revokeAllUserTokens(tokenRecord.userId);
      throw new UnauthorizedException('Refresh token reused - Security alert');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (tokenRecord.replacedByTokenHash) {
      this.logger.warn(
        `Refresh token reuse (replaced) detected for user ${tokenRecord.userId}. Revoking all tokens.`,
      );
      await this.revokeAllUserTokens(tokenRecord.userId);
      throw new UnauthorizedException('Refresh token reused - Security alert');
    }

    // Generate new tokens
    const tokens = await this.generateTokens(tokenRecord.user, ip, userAgent);
    const newTokenHash = this.hashToken(tokens.refreshToken);

    // Update old token
    tokenRecord.revokedAt = new Date();
    tokenRecord.replacedByTokenHash = newTokenHash;
    await this.refreshTokenRepository.save(tokenRecord);

    return tokens;
  }

  async revokeRefreshToken(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const tokenRecord = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
    });

    if (!tokenRecord) {
      return;
    }

    tokenRecord.revokedAt = new Date();
    await this.refreshTokenRepository.save(tokenRecord);
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, revokedAt: undefined },
      { revokedAt: new Date() },
    );
  }

  private async generateTokens(
    user: User,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokensDto> {
    const accessTokenPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      type: 'access',
    };

    const accessSecret = this.configService.get<string>('JWT_ACCESS_SECRET');
    const accessTtl = this.configService.get<string>('JWT_ACCESS_TTL');
    const refreshTtl =
      this.configService.get<string>('JWT_REFRESH_TTL') || '604800';

    if (!accessSecret) {
      throw new Error('JWT_ACCESS_SECRET is not configured');
    }

    const accessToken = await this.jwtService.signAsync(accessTokenPayload, {
      secret: accessSecret,
      expiresIn: accessTtl || '15m',
    });

    // Generate Opaque Refresh Token
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + parseInt(refreshTtl, 10) * 1000);

    const refreshTokenRecord = this.refreshTokenRepository.create({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt,
      ip,
      userAgent,
    });

    await this.refreshTokenRepository.save(refreshTokenRecord);

    return {
      accessToken,
      refreshToken,
    };
  }
}
