import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { CreateAuthDto } from '../dto/create-auth.dto';
import { UpdateAuthDto } from '../dto/update-auth.dto';
import { NonceService } from '../../../common/cache/nonce.service';
import { NonceResponseDto } from '../dto/nonce-response.dto';
import { ConfigService } from '../../../config/config.service';
import { randomBytes } from 'crypto';
import { UserService } from '../../user/providers/user.service';
import { MailService } from '../../mail/mail.service';
import { User } from '../../user/entities/user.entity';
import {
  LoginResponse,
  RegisterResponse,
  JwtPayload,
} from '../interfaces/auth.interface';

// Re-export interfaces for backward compatibility
export type { LoginResponse };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly nonceService: NonceService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
  ) {}

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
      .sendLoginEmail(
        { email: user.email, firstName: user.firstName },
        { time: new Date() }
      )
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
   * 📝 Register a new user
   * Creates user account and returns safe user payload
   */
  async register(registerDto: RegisterDto): Promise<RegisterResponse> {
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
      password: hashedPassword,
      isActive: true,
    });

    // Remove password from response
    const { password: _, ...safeUser } = user;

    this.logger.log(`New user registered: ${email}`);

    this.mailService
      .sendWelcomeEmail({ email: user.email, firstName: user.firstName })
      .catch((err) => {
        this.logger.error(`Failed to send welcome email: ${err.message}`);
      });

    return {
      message: 'User registered successfully',
      user: safeUser as Omit<User, 'password'>,
    };
  }

  /**
   * 🔐 Verify password against hashed password
   * Uses bcrypt for secure password comparison
   */
  private async verifyPassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
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
  private async generateJwtToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      iat: Math.floor(Date.now() / 1000),
      exp:
        Math.floor(Date.now() / 1000) +
        this.parseExpiresIn(this.configService.jwtExpiresIn),
    };

    return this.jwtService.sign(payload);
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
