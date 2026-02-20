import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { CreateAuthDto } from '../dto/create-auth.dto';
import { UpdateAuthDto } from '../dto/update-auth.dto';
import { NonceService } from 'src/common/cache/nonce.service';
import { NonceResponseDto } from '../dto/nonce-response.dto';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly nonceService: NonceService,
    private readonly configService: ConfigService,
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
