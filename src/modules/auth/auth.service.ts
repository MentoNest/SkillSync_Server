import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { verifyMessage } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

export interface JwtPayload {
  sub: string;
  walletAddress: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // In-memory storage (replace with Redis in production)
  private nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Generate a nonce for wallet authentication
   */
  async generateNonce(walletAddress: string): Promise<string> {
    const nonce = uuidv4();
    
    // Store nonce with 5 minute expiration
    this.nonceStore.set(walletAddress, {
      nonce,
      expiresAt: Date.now() + 300000, // 5 minutes
    });
    
    this.logger.log(`Generated nonce for wallet: ${walletAddress}`);
    return nonce;
  }

  /**
   * Verify wallet signature
   */
  async verifySignature(
    walletAddress: string,
    signature: string,
    nonce: string,
  ): Promise<boolean> {
    try {
      // Reconstruct the message that was signed
      const message = `Sign this message to authenticate with SkillSync. Nonce: ${nonce}`;
      
      // Recover the address from the signature
      const recoveredAddress = verifyMessage(message, signature);
      
      // Check if recovered address matches the provided address
      return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
    } catch (error) {
      this.logger.error('Signature verification failed', error);
      return false;
    }
  }

  /**
   * Login with wallet authentication
   */
  async login(loginDto: LoginDto) {
    const { walletAddress, signature, nonce } = loginDto;

    // Verify nonce
    const storedNonceData = this.nonceStore.get(walletAddress);

    if (!storedNonceData || storedNonceData.nonce !== nonce) {
      throw new UnauthorizedException('Invalid or expired nonce');
    }

    // Check if nonce is expired
    if (Date.now() > storedNonceData.expiresAt) {
      this.nonceStore.delete(walletAddress);
      throw new UnauthorizedException('Nonce expired');
    }

    // Verify signature
    const isValidSignature = await this.verifySignature(
      walletAddress,
      signature,
      nonce,
    );

    if (!isValidSignature) {
      throw new UnauthorizedException('Invalid signature');
    }

    // Delete used nonce
    this.nonceStore.delete(walletAddress);

    // Generate tokens (in production, fetch/create user from DB)
    const payload: JwtPayload = {
      sub: uuidv4(), // Replace with actual user ID from DB
      walletAddress,
      role: 'user', // Replace with actual user role from DB
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = this.jwtService.sign(
      { ...payload, type: 'refresh' },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      },
    );

    // Audit log
    this.logger.log(`User logged in: ${walletAddress}`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: payload.sub,
        walletAddress,
        role: payload.role,
      },
    };
  }

  /**
   * Refresh access token
   */
  async refreshTokens(refreshDto: RefreshDto) {
    const { refreshToken } = refreshDto;

    try {
      // Verify refresh token
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      // Generate new access token
      const newPayload: JwtPayload = {
        sub: payload.sub,
        walletAddress: payload.walletAddress,
        role: payload.role,
      };

      const newAccessToken = this.jwtService.sign(newPayload);

      return {
        accessToken: newAccessToken,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Logout (TODO: implement token blacklisting with Redis)
   */
  async logout(accessToken: string, userId: string): Promise<void> {
    // TODO: Blacklist token in Redis
    this.logger.log(`User logged out: ${userId}`);
  }

  /**
   * Validate JWT token payload
   */
  async validateToken(payload: JwtPayload) {
    // In production, verify user exists in database
    return {
      userId: payload.sub,
      walletAddress: payload.walletAddress,
      role: payload.role,
    };
  }

  /**
   * Get user profile (TODO: fetch from database)
   */
  async getProfile(userId: string) {
    // TODO: Fetch from database
    return {
      id: userId,
      walletAddress: '0x...',
      role: 'user',
    };
  }
}
