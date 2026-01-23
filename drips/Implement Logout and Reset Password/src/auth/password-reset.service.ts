import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import * as bcrypt from "bcrypt";
import { RedisService } from "../redis/redis.service";
import { UsersService } from "../users/users.service";
import { MailService } from "../mail/mail.service";
import { TokenBlacklistService } from "./token-blacklist.service";

@Injectable()
export class PasswordResetService {
  private readonly RESET_TOKEN_PREFIX = "reset:token:";
  private readonly RESET_TOKEN_EXPIRY = 3600; // 1 hour in seconds

  constructor(
    private readonly redisService: RedisService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly tokenBlacklistService: TokenBlacklistService,
  ) {}

  async createResetToken(email: string): Promise<void> {
    // Find user by email
    const user = await this.usersService.findByEmail(email);

    // Don't reveal if email exists or not (security best practice)
    if (!user) {
      return;
    }

    // Generate secure random token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Hash the token before storing
    const hashedToken = await bcrypt.hash(resetToken, 10);

    // Store hashed token in Redis with user ID and expiry
    const key = `${this.RESET_TOKEN_PREFIX}${resetToken}`;
    const payload = JSON.stringify({
      userId: user.id,
      email: user.email,
      createdAt: Date.now(),
    });

    await this.redisService.set(key, payload, this.RESET_TOKEN_EXPIRY);

    // Send reset email
    const resetUrl = `${this.configService.get("FRONTEND_URL")}/reset-password?token=${resetToken}`;
    await this.mailService.sendPasswordResetEmail(email, resetUrl);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (!token || !newPassword) {
      throw new BadRequestException("Token and new password are required");
    }

    // Retrieve token data from Redis
    const key = `${this.RESET_TOKEN_PREFIX}${token}`;
    const tokenData = await this.redisService.get(key);

    if (!tokenData) {
      throw new BadRequestException("Invalid or expired reset token");
    }

    let payload: { userId: string; email: string; createdAt: number };

    try {
      payload = JSON.parse(tokenData);
    } catch (error) {
      throw new BadRequestException("Invalid token format");
    }

    // Validate token age (additional check)
    const tokenAge = Date.now() - payload.createdAt;
    if (tokenAge > this.RESET_TOKEN_EXPIRY * 1000) {
      await this.redisService.delete(key);
      throw new BadRequestException("Reset token has expired");
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    await this.usersService.updatePassword(payload.userId, hashedPassword);

    // Delete the used token
    await this.redisService.delete(key);

    // Invalidate all existing sessions for this user
    await this.tokenBlacklistService.invalidateUserSessions(payload.userId);

    // Send confirmation email
    await this.mailService.sendPasswordChangedEmail(payload.email);
  }

  async validateResetToken(token: string): Promise<boolean> {
    const key = `${this.RESET_TOKEN_PREFIX}${token}`;
    const tokenData = await this.redisService.get(key);
    return tokenData !== null;
  }
}
