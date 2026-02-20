import { Injectable } from '@nestjs/common';
import { CreateAuthDto } from '../dto/create-auth.dto';
import { UpdateAuthDto } from '../dto/update-auth.dto';
import { NonceService } from 'src/common/cache/nonce.service';
import { NonceResponseDto } from '../dto/nonce-response.dto';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly nonceService: NonceService,
    private readonly configService: ConfigService,
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
