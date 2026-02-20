import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { CreateAuthDto, LoginUserDto } from '../dto/create-auth.dto';
import { UpdateAuthDto } from '../dto/update-auth.dto';
import { NonceService } from 'src/common/cache/nonce.service';
import { NonceResponseDto } from '../dto/nonce-response.dto';
import { ConfigService } from '../../../config/config.service';
import { randomBytes, createHash } from 'crypto';
import { UserService } from '../../user/providers/user.service';
import { MailService } from '../../mail/mail.service';
import { User } from '../../user/entities/user.entity';

export interface LoginResponse {
  accessToken: string;
  user: Omit<User, 'password'>;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly nonceService: NonceService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly mailService: MailService,
  ) {}

  async generateNonce(ttl: number = 300): Promise<NonceResponseDto> {
    // Generate a cryptographically secure random nonce
    const nonce = randomBytes(32).toString('hex');

    // Store the nonce in cache with TTL
    await this.nonceService.storeNonce(nonce, ttl);

    // Calculate expiration timestamp
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;

    return {
      nonce,
      expiresAt,
      ttl,
    };
  }

  /**
   * 🔐 Login user with email and password
   * Returns JWT access token and safe user payload
   */
  async login(loginUserDto: LoginUserDto): Promise<LoginResponse> {
    const { email, password } = loginUserDto;

    // Find user by email
    const user = await this.userService.findByEmail(email);

    if (!user) {
      // Generic error message to prevent user enumeration
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password using configured hashing utility
    const isPasswordValid = await this.verifyPassword(password, user.password);

    if (!isPasswordValid) {
      // Generic error message to prevent user enumeration
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Generate JWT token
    const accessToken = await this.generateJwtToken(user);

    // Send login notification email (fire and forget)
    this.mailService
      .sendLoginEmail(user.email, user.firstName)
      .catch((err) => {
        this.logger.error(`Failed to send login email: ${err.message}`);
      });

    // Remove password from user object before returning
    const { password: _, ...safeUser } = user;

    return {
      accessToken,
      user: safeUser as Omit<User, 'password'>,
    };
  }

  /**
   * 🔐 Verify password against hashed password
   * Uses SHA-256 hashing for demonstration - use bcrypt/argon2 in production
   */
  private async verifyPassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    // In production, use bcrypt.compare() or argon2.verify()
    // For this implementation, using SHA-256 hash comparison
    const hashedInput = createHash('sha256')
      .update(plainPassword)
      .digest('hex');
    return hashedInput === hashedPassword;
  }

  /**
   * 🔐 Hash password
   * Uses SHA-256 hashing for demonstration - use bcrypt/argon2 in production
   */
  async hashPassword(plainPassword: string): Promise<string> {
    // In production, use bcrypt.hash() or argon2.hash()
    // For this implementation, using SHA-256
    return createHash('sha256').update(plainPassword).digest('hex');
  }

  /**
   * 🔐 Generate JWT token for user
   */
  private async generateJwtToken(user: User): Promise<string> {
    // Create JWT payload with claims
    const payload = {
      sub: user.id,
      email: user.email,
      iat: Math.floor(Date.now() / 1000),
      exp:
        Math.floor(Date.now() / 1000) +
        this.parseExpiresIn(this.configService.jwtExpiresIn),
    };

    // Simple JWT implementation using base64 encoding
    // In production, use @nestjs/jwt package with proper signing
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
      'base64url',
    );
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );

    // Create signature
    const signature = createHash('sha256')
      .update(`${encodedHeader}.${encodedPayload}.${this.configService.jwtSecret}`)
      .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
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

  create(createAuthDto: CreateAuthDto) {
    return 'This action adds a new auth';
  }

  findAll() {
    return `This action returns all auth`;
  }

  findOne(id: number) {
    return `This action returns a #${id} auth`;
  }

  update(id: number, updateAuthDto: UpdateAuthDto) {
    return `This action updates a #${id} auth`;
  }

  remove(id: number) {
    return `This action removes a #${id} auth`;
  }
}
